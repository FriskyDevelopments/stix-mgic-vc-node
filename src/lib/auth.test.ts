import { describe, expect, it } from 'vitest'
import { telegramVerifyBody } from './auth'

describe('telegramVerifyBody', () => {
  it('posts only { initData } for Mini App payloads', () => {
    expect(
      telegramVerifyBody({
        initData: ' query_id=abc&hash=deadbeef ',
        extra: 'nope',
        bot: 'MyFenrirTeleConnectBot',
      }),
    ).toEqual({ initData: 'query_id=abc&hash=deadbeef' })
  })

  it('keeps a nested Mini App user object for HMAC reconstruction', () => {
    const user = { id: 42, first_name: 'Ada' }
    expect(
      telegramVerifyBody({
        auth_date: '1',
        hash: 'aa',
        user,
        extra: 'nope',
      }),
    ).toEqual({ auth_date: '1', hash: 'aa', user })
  })

  it('allowlists Login Widget fields and drops extras', () => {
    expect(
      telegramVerifyBody({
        id: 99,
        first_name: 'Stix',
        auth_date: 1,
        hash: 'aa',
        last_name: '',
        bot: 'MyFenrirTeleConnectBot',
      }),
    ).toEqual({ id: 99, first_name: 'Stix', auth_date: 1, hash: 'aa' })
  })
})
