const config = require('./config')
const Promise = require('bluebird')

class ReadyQueueConsumer {
  constructor (channel, logger) {
    this.channel = channel
    this.logger = logger || console
  }

  start () {
    const self = this
    return self.channel.consume(config.readyQueueName, (msg) =>
      Promise
        .try(() => {
          const targetQueueName = msg.properties.headers._targetQueue
          const properties = msg.properties.headers._originalProperties
          return self.channel.sendToQueue(targetQueueName, new Buffer(msg.content), properties)
        })
        .then(() => self.channel.ack(msg))
        .catch((err) => {
          this.logger.error('Error: while trying to process message from ready queue. error: %s, msg: ', err, msg)
          self.channel.nack(msg)
        })
    , {noAck: false})
  }
}

module.exports = ReadyQueueConsumer
