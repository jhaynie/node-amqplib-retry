var config = require('./config')
var Promise = require('bluebird')

class Initializer {
  constructor (channel, clientQueueName, failureQueueName) {
    this.channel = channel
    this.clientQueueName = clientQueueName
    this.failureQueueName = failureQueueName
  }

  initialize () {
    const self = this
    return Promise
      .try(() => {
        return Promise.all([
          self.channel.assertQueue(config.delayQueueName, {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': config.exchangeName,
              'x-dead-letter-routing-key': config.readyRouteKey
            }
          }),
          self.channel.assertQueue(config.readyQueueName, { durable: true }),
          self.channel.checkQueue(self.clientQueueName),
          self.channel.checkQueue(self.failureQueueName),
          self.channel.assertExchange(config.exchangeName, 'direct', { durable: true })
        ])
      })
      .then(() => self.channel.bindQueue(config.readyQueueName, config.exchangeName, config.readyRouteKey))
      .then(() => {
        self.isInitialized = true
      })
  }
}

module.exports = Initializer
