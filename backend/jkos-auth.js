import jwt from 'jsonwebtoken'

export function jkosAuth(opts) {
  const { publicKey, issuer = 'jkos-auth' } = opts
  const key = (publicKey || '').replace(/\\n/g, '\n')
  if (!key.trim()) throw new Error('jkosAuth: publicKey is required')

  return function jkosAuthMiddleware(req, res, next) {
    const token = req.cookies?.jkos_token
    if (!token) {
      return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHENTICATED' })
    }
    try {
      req.user = jwt.verify(token, key, { algorithms: ['RS256'], issuer })
      next()
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' })
      }
      res.status(401).json({ error: 'Invalid token', code: 'UNAUTHENTICATED' })
    }
  }
}
