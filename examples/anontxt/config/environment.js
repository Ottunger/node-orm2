const path = require('path');
const express = require('express');
const settings = require('./settings');
const models = require('../app/models/');

module.exports = function (app) {
    app.configure(function () {
        app.use(express.static(path.join(settings.path, 'public')));
        app.use(express.logger({format: 'dev'}));
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(function (req, res, next) {
            models(function (err, db) {
                if (err) return next(err);

                req.models = db.models;
                req.db = db;

                return next();
            });
        }),
            app.use(app.router);
    });
};
