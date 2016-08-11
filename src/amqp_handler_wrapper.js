const _ = require('lodash')
const Promise = require('bluebird')
const config = require('./config')

// attempts must be a number in milliseconds
const getDefaultDelay = (attempts) => {
  const delay = Math.pow(2, attempts)
  if (delay > 60 * 60 * 24) {
    // the delay for the message is longer than 24 hours.  Fail the message and never retry again.
    return -1
  }
  return delay * 1000
}

module.exports = function (channel, clientQueueName, failureQueueName, clientHandler, delayFunction, initializer, logger, noack) {
  const errorHandler = (msg) => {
    if (!initializer.isInitialized) {
      // Delay in 1 MS to let the queues/exchange/bindings initialize
      return Promise
        .delay(1)
        .then(() => errorHandler(msg))
    }

    _.defaults(msg, { properties: {} })
    _.defaults(msg.properties, { headers: {} })
    _.defaults(msg.properties.headers, { _retryCount: 0 }) // _retryCount: 0 means this message has never been retried before.

    msg.properties.headers._retryCount += 1
    const expiration = (delayFunction || getDefaultDelay)(msg.properties.headers._retryCount)

    if (expiration < 1) {
      return channel.sendToQueue(failureQueueName, new Buffer(msg.content), msg.properties)
    }

    const properties = {
      persistent: true,
      headers: {
        _originalProperties: msg.properties, // save the original properties.
        _targetQueue: clientQueueName // save the target queue name we should publish to after the delay is over.
      }
    }

    _.extend(properties, {
      expiration: expiration.toString()
    })

    return channel.publish('', config.delayQueueName, new Buffer(msg.content), properties)
  }

  const handlerWrapper = (msg) =>
    Promise
      .try(() => clientHandler(msg))
      .catch((err) => {
        // Something went wrong. Let's handle this message.
        // Adding the string 'error' to support papertrail error filters.
        (logger || console).error('Error: AMQP retry handler caught the following error: ', err)
        return Promise
          .try(() => errorHandler(msg))
          .catch((err) => {
            // Something went wrong while trying to process the erroneous message.
            // Sending nack so the client can try to process it again.
            channel.nack(msg)
            throw err
          })
      })
      .then(() =>
        // We ack it for the user. Either way if the message has been processed successfully or
        // not, the message should be out of the original queue, therefore - acked.
        !noack && channel.ack(msg)
      )

  return handlerWrapper
}
