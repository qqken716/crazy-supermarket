const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const collection = db.collection('user_profiles')
const command = db.command

function sanitizeProfile(input, openId) {
  if (!input || input.schemaVersion !== 1) {
    throw new Error('INVALID_PROFILE')
  }

  const profile = JSON.parse(JSON.stringify(input))
  profile.identity.openId = openId
  delete profile._id
  delete profile._openid
  return profile
}

async function loadProfile(openId) {
  const result = await collection.where({ _openid: openId }).limit(1).get()
  return result.data[0] || null
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()

  if (event.action === 'load') {
    const document = await loadProfile(OPENID)
    if (!document) {
      return { profile: null }
    }

    const { _id, _openid, ...profile } = document
    return { profile }
  }

  if (event.action !== 'save') {
    throw new Error('UNSUPPORTED_ACTION')
  }

  const expectedRevision = Number(event.expectedRevision || 0)
  const incoming = sanitizeProfile(event.profile, OPENID)
  const serverUpdatedAt = Date.now()
  const nextRevision = expectedRevision + 1
  const nextProfile = {
    ...incoming,
    revision: nextRevision,
    serverUpdatedAt,
  }

  if (expectedRevision === 0) {
    const existing = await loadProfile(OPENID)
    if (!existing) {
      try {
        await collection.add({
          data: {
            _id: OPENID,
            _openid: OPENID,
            ...nextProfile,
          },
        })
        return { ok: true, conflict: false, profile: nextProfile }
      } catch (error) {
        const current = await loadProfile(OPENID)
        if (current) {
          const { _id, _openid, ...currentProfile } = current
          return { ok: false, conflict: true, profile: currentProfile }
        }
        throw error
      }
    }
  }

  const updateResult = await collection
    .where({
      _openid: OPENID,
      revision: command.eq(expectedRevision),
    })
    .update({
      data: nextProfile,
    })

  if (updateResult.stats.updated === 1) {
    return { ok: true, conflict: false, profile: nextProfile }
  }

  const current = await loadProfile(OPENID)
  if (!current) {
    throw new Error('PROFILE_NOT_FOUND')
  }
  const { _id, _openid, ...currentProfile } = current
  return { ok: false, conflict: true, profile: currentProfile }
}
