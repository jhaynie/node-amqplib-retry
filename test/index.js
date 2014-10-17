(function () {
  'use strict';

  var _ = require('underscore'),
    Retry = require('../lib/index'),
    should = require('should'),
    Promise = require('bluebird'),
    TEST_QUEUE_NAME = 'rabbitmq-retry-test',
    FAILURE_QUEUE_NAME = 'rabbitmq-retry-test-failure',
    amqp = require('amqplib'),
    channel;

  describe('rabbitmq-retry tests', function () {
    before(function () {
      return Promise.resolve(amqp.connect('amqp://guest:guest@localhost:5672'))
        .then(function (conn) {
          return conn.createChannel();
        })
        .then(function (ch) {
          channel = Promise.promisifyAll(ch);
          return channel;
        })
        .then(function () {
          return Promise.all([
            channel.assertQueue(TEST_QUEUE_NAME, {durable: false, autoDelete: true}),
            channel.assertQueue(FAILURE_QUEUE_NAME, {durable: false, autoDelete: true})
          ]);
        });
    });

    beforeEach(function () {
      return Promise.all([
        channel.purgeQueue(TEST_QUEUE_NAME),
        channel.purgeQueue(FAILURE_QUEUE_NAME)
      ]);
    });

    after(function () {
      return Promise.all([
        channel.deleteQueue(TEST_QUEUE_NAME),
        channel.deleteQueue(FAILURE_QUEUE_NAME)
      ]);
    });

    function testDelay(options) {
      return Promise.resolve()
        .then(function () {
          return new Retry(_.defaults({
            failureQueueName: FAILURE_QUEUE_NAME
          }, options || {}));
        })
        .tap(function (retry) {
          return retry.start();
        })
        .then(function (retry) {
          return retry.retry(JSON.stringify({content: 'abc', properties: {expiration: '60000'}}), 'rabbitmq-retry-test');
        })
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(0);
        })
        .delay(1000)
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(0);
        })
        .delay(2000)
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(1);
        });
    }

    it('should test delay', function () {
      return testDelay();
    });
    it('should test delay with given AMQPLIB connection', function () {
      return testDelay({amqplibConnection: amqp.connect('amqp://guest:guest@localhost:5672')});
    });

    it('should test failure', function () {
      return Promise.resolve()
        .then(function () {
          return new Retry({
            failureQueueName: FAILURE_QUEUE_NAME,
            delayFunction: function () {
              return -1;
            }
          });
        })
        .tap(function (retry) {
          return retry.start();
        })
        .then(function (retry) {
          return retry.retry(JSON.stringify({content: 'abc', properties: {expiration: '60000'}}), 'rabbitmq-retry-test');
        })
        .delay(1)
        .then(function () {
          return channel.checkQueue(TEST_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(0);
        })
        .then(function () {
          return channel.checkQueue(FAILURE_QUEUE_NAME);
        })
        .then(function (ok) {
          should(ok.messageCount).eql(1);
        });
    });

    it('should test not specified failure queue', function () {
      should(function () {
        return new Retry();
      }).throw(Error('\'failureQueueName\' not specified.  See documentation.'));
    });
  });
}());
