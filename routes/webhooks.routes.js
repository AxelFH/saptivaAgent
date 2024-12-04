const { callback, postValues } = require('../services/webhooks.http')

const router = require('express').Router()

router.get('', callback)
router.post('', postValues)

module.exports = router
