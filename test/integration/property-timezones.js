const should = require('should');
const helper = require('../support/spec_helper');
const common = require('../common');
const ORM = require('../../');

if (common.protocol() === "mongodb") return;
if (common.protocol() === "sqlite" && !common.getConfig().pathname) {
    // sqlite needs a pathname for this test (because of reconnecting)
    // if using memory, when disconnecting everything is lost and this
    // test needs it
    return;
}

describe("Timezones", function () {
    const db = null;
    const Event = null;

    const setup = function (opts) {
        return function (done) {
            helper.connect({query: opts.query}, function (connection) {
                db = connection;
                db.settings.set('instance.identityCache', false);

                Event = db.define("event", {
                    name: {type: 'text'},
                    when: {type: 'date', time: true}
                });

                if (opts.sync) {
                    return helper.dropSync(Event, done);
                } else {
                    return done();
                }
            });
        };
    };

    describe("specified", function () {
        let a;
        const zones = ['local', '-0734'/*, '+11:22'*/];

        for (a = 0; a < zones.length; a++) {
            describe(zones[a], function () {
                before(setup({sync: true, query: {timezone: zones[a]}}));

                after(function () {
                    return db.close();
                });

                it("should get back the same date that was stored", function (done) {
                    const when = new Date(2013, 12, 5, 5, 34, 27);

                    Event.create({name: "raid fridge", when: when}, function (err) {
                        should.not.exist(err);

                        Event.one({name: "raid fridge"}, function (err, item) {
                            should.not.exist(err);
                            item.when.should.eql(when);

                            return done();
                        });
                    });
                });
            });
        }
    });

    describe("different for each connection", function () {
        before(setup({
            sync: true,
            query: {timezone: '+0200'}
        }));

        after(function () {
            return db.close();
        });

        // This isn't consistent accross drivers. Needs more thinking and investigation.
        it("should get back a correctly offset time", function (done) {
            const when = new Date(2013, 12, 5, 5, 34, 27);

            Event.create({name: "raid fridge", when: when}, function (err, new_event) {
                should.not.exist(err);

                Event.one({name: "raid fridge"}, function (err, item) {
                    should.not.exist(err);
                    new_event.should.not.equal(item); // new_event was not cached
                    should.equal(new_event.when.toISOString(), item.when.toISOString());

                    db.close(function () {
                        setup({
                            sync: false, // don't recreate table, don't want to loose previous value
                            query: {timezone: '+0400'}
                        })(function () {
                            Event.one({name: "raid fridge"}, function (err, item) {
                                const expected = new Date(2013, 12, 5, 3, 34, 27);

                                should.not.exist(err);
                                item.when.should.eql(expected);

                                return done();
                            });
                        });
                    });
                });
            });
        });
    });
});
