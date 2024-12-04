const allOk = require('../services/server.http')

const router = require('express').Router()

router.get('', allOk)

module.exports = router