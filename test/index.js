(function () {
  'use strict';

  var Retry = require('../lib/index'),
    should = require('should'),
    Promise = require('bluebird'),
    TEST_QUEUE_NAME = 'rabbitmq-retry-test',
    FAILURE_QUEUE_NAME = 'rabbitmq-retry-test-failure',
    amqp = require('amqplib'),
    connection,
    channel;


  function connect() {
    if (!connection) {
      connection = amqp.connect('amqp://guest:guest@localhost:5672');
    }
    return connection;
  }

  describe('rabbitmq-retry tests', function () {
    before(function (done) {
      Promise.resolve()
        .then(function () {
          return connect();
        })
        .then(function (conn) {
          return conn.createChannel();
        })
        .then(function (ch) {
          channel = ch;
          return Promise.promisifyAll(channel);
        })
        .then(function () {
          return Promise.all([
            channel.assertQueue(TEST_QUEUE_NAME, {durable: false, autoDelete: true}),
            channel.assertQueue(FAILURE_QUEUE_NAME, {durable: false, autoDelete: true})
          ]);
        })
        .then(function () {
          done();
        }, done);
    });

    beforeEach(function (done) {
      Promise.resolve()
        .then(function () {
          return Promise.all([
            channel.purgeQueue(TEST_QUEUE_NAME),
            channel.purgeQueue(FAILURE_QUEUE_NAME)
          ]);
        })
        .then(function () {
          done();
        }, done);
    });

    after(function (done) {
      Promise.resolve()
        .then(function () {
          return Promise.all([
            channel.deleteQueue(TEST_QUEUE_NAME),
            channel.deleteQueue(FAILURE_QUEUE_NAME)
          ]);
        })
        .then(function () {
          done();
        }, done);
    });

    it('should test delay', function (done) {
      Promise.resolve()
        .then(function () {
          return new Retry({failureQueueName: FAILURE_QUEUE_NAME});
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
          done();
        }, done);
    });

    it('should test failure', function (done) {
      Promise.resolve()
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
          done();
        }, done);
    });

    it('should test not specified failure queue', function (done) {
      should(function () {
        return new Retry();
      }).throw(Error('\'failureQueueName\' not specified.  See documentation.'));
      done();
    });
  });
}());
