const config = require('./config')
const Promise = require('bluebird')

class ReadyQueueConsumer {
  constructor (channel) {
    this.channel = channel
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
          console.error('Error: while trying to process message from ready queue.  err: ' + err + ', msg: ' + JSON.stringify(msg))
          self.channel.nack(msg)
        })
    )
  }
}

module.exports = ReadyQueueConsumer
