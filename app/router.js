import Ember from 'ember';
import config from './config/environment';

var Router = Ember.Router.extend({
  location: config.locationType
});

Router.map(function() {
  this.resource("about", { path: "/" });
  this.resource("admin", function () {
  });
  this.resource("products", function () {
    this.resource("new-product", { path: "new" });
    this.resource("edit");
    this.resource("product", { path: ":product_id" }, function () {
      this.resource("edit-product", { path: "edit" });
    });
  });
  this.route('admin');
  this.resource('contact');
  this.resource('contacts');
  this.resource('more-info');
});

export default Router;
