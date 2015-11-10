var fs = require('fs');
var path = require('path');

var request = require('superagent');
var async = require('async');
var _ = require('lodash');

var inquirer = require("inquirer");
var yargs = require('yargs');
var chalk = require('chalk');

var workshops = require('./workshops').list;

var argv = yargs.argv;
var jsonRes;

var githubReposUrl = 'https://api.github.com/repos';
var workshopsWithStatus = [];

console.log(chalk.yellow('workbook-progress-tracker needs your github login details ') + chalk.yellow.underline('only') + chalk.yellow(' to make make api requests with a higher rate limit. Login details are not saved.'));
inquirer.prompt([
  {
    type: 'input',
    name: 'username',
    message: 'Enter your github username:',
    validate: function(str) {
      return str !== '';
    }
  },
  {
    type: 'password',
    name: 'password',
    message: 'Enter your github password:',
    validate: function(str) {
      return str !== '';
    }
  }, 
], function(prompt) {
  async.each(workshops, function(workshop, callback) {
    async.waterfall([
      // get menu.json url
      function(callback) {
        if(_.isArray(workshop.menu)) {
          callback(null, workshop, null);
        }
        else {
          var menuUrl;
          menuUrl =  githubReposUrl + '/' + workshop.owner + '/' + workshop.name + '/' + workshop.menu + '/' + 'menu.json';
          request
            .get(menuUrl)
            .auth(prompt.username, prompt.password)
            .end(function(err, res) {
              if(err) { console.log("not found", menuUrl); throw err; }
              jsonRes = JSON.parse(res.text);
              callback(null, workshop, jsonRes.download_url);
            });
        }
      },
      // download menu.json
      function(workshop, menuDownloadUrl, callback) {
        if(!menuDownloadUrl) {
          callback(null, workshop, null);
        } else {
          request
            .get(menuDownloadUrl)
            .end(function(err, res) {
              if(err) throw err;
              jsonRes = JSON.parse(res.text);
              callback(null, workshop, jsonRes);
            });
        }
      },
      // get completed menu
      function(workshop, menu, callback) {
        if(!menu) {
          menu = workshop.menu;
        }
        var workshopDirName = workshop.dirName ? workshop.dirName : workshop.name;
        var workshopCompletedMenuPath = path.join(process.env.HOME, '.config', workshopDirName, 'completed.json');
        fs.readFile(workshopCompletedMenuPath, 'utf8', function(err, completedMenu) {
          if (err) {
            //throw err;
            callback(null, workshop, menu, []); //could be not started or not installed
          } else {
            var jsonRes = JSON.parse(completedMenu);
            callback(null, workshop, menu, jsonRes);
          }
        });
      },
      // calculate progress
      function(workshop, menu, completedMenu, callback) {
        var todo = menu.length;
        var done = completedMenu.length;
        if(done === todo) {
          // console.log(chalk.green(workshop.name, "completed!"));
          workshopsWithStatus.push( {
            name: workshop.name,
            status: 'completed'
          });
        } else if(done === 0) {
          // console.log(chalk.red(workshop.name, "not started"));
          workshopsWithStatus.push( {
            name: workshop.name,
            status: 'not-started'
          });
        } else {
          // console.log(chalk.yellow(workshop.name, "in progress (", done, " of ", todo, ")"));
          workshopsWithStatus.push( {
            name: workshop.name,
            status: 'in-progress',
            todo: todo,
            done: done
          });
        }
        callback(null, workshop);
      }
    ], function(err, workshop) { // single iteration completed
      callback(); //callback to trigger completion of this iteration
    });
  }, function(err) { //all iterations completed
    if(err) throw err;
    console.log(chalk.green("COMPLETED (" + _.filter(workshopsWithStatus, 'status', 'completed').length + ")"));
    _.forEach(_.filter(workshopsWithStatus, 'status', 'completed'), function(w) { console.log(w.name); });
    console.log();
    console.log(chalk.yellow("IN PROGRESS ("+ _.filter(workshopsWithStatus, 'status', 'in-progress').length + ")"));
    _.forEach(_.filter(workshopsWithStatus, 'status', 'in-progress'), function(w) { console.log(w.name, "("+w.done+"/"+w.todo+")"); });
    console.log();
    console.log(chalk.red("NOT STARTED (" + _.filter(workshopsWithStatus, 'status', 'not-started').length + ")"));
    _.forEach(_.filter(workshopsWithStatus, 'status', 'not-started'), function(w) { console.log(w.name); });
  });
});