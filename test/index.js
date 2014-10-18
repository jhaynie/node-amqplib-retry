(function () {
  'use strict';

  var Retry = require('../lib/index'),
    should = require('should'),
    Promise = require('bluebird'),
    TEST_QUEUE_NAME = 'rabbitmq-retry-test',
    FAILURE_QUEUE_NAME = 'rabbitmq-retry-test-failure',
    CONSUMER_TAG = 'CONSUMER_TAG',
    amqp = require('amqplib'),
    channel;

  describe('rabbitmq-retry tests', function () {
    before(function () {
      return Promise.resolve(amqp.connect('amqp://guest:guest@localhost:5672'))
        .then(function (conn) {
          return conn.createChannel();
        })
        .then(function (ch) {
          Promise.promisifyAll(ch);
          channel = ch;
          return ch;
        })
        .tap(function (ch) {
          return Promise.all([
            ch.assertQueue(TEST_QUEUE_NAME, {durable: false}),
            ch.assertQueue(FAILURE_QUEUE_NAME, {durable: false})
          ]);
        });
    });

    beforeEach(function () {
      return Promise.resolve(channel)
        .then(function (ch) {
          return Promise.all([
            ch.purgeQueue(TEST_QUEUE_NAME),
            ch.purgeQueue(FAILURE_QUEUE_NAME)
          ]);
        });
    });

    afterEach(function () {
      return Promise.resolve(channel)
        .tap(function (ch) {
          return ch.cancel(CONSUMER_TAG);
        });
    });

    after(function () {
      return Promise.resolve(channel)
        .then(function (ch) {
          return Promise.all([
            ch.deleteQueue(TEST_QUEUE_NAME),
            ch.deleteQueue(FAILURE_QUEUE_NAME)
          ]);
        });
    });

    function startListenerAndPushMessage(handler, delayFunction) {
      return Promise.resolve()
        .then(function () {
          var retry = new Retry(channel, TEST_QUEUE_NAME, FAILURE_QUEUE_NAME, delayFunction, handler);

          return channel.consume(TEST_QUEUE_NAME, retry, {consumerTag: CONSUMER_TAG});
        })
        .then(function () {
          return channel.sendToQueue(TEST_QUEUE_NAME, new Buffer('abc'));
        });
    }

    it('should test delay', function () {
      var times = 0,
        threw;

      function handler(msg) {
        times += 1;
        if (!threw) {
          threw = true;
          throw Error('this is an error');
        } else {
          channel.ack(msg);
        }
      }

      return startListenerAndPushMessage(handler)
        .delay(1000)
        .then(function () {
          should(times).eql(1);
        })
        .delay(2000)
        .then(function () {
          should(times).eql(2);
        });
    });

    it('should test failure', function () {
      function handler() {
        throw Error('this is an error');
      }

      function delayFunction() {
        return -1;
      }

      return startListenerAndPushMessage(handler, delayFunction)
        .delay(1000)
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
