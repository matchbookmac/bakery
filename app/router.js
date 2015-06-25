import Ember from 'ember';
import config from './config/environment';

var Router = Ember.Router.extend({
  location: config.locationType
});

Router.map(function() {
  this.resource("about", { path: "/" });
  this.resource("admin");
  this.resource("products", function () {
    this.resource("new-product", { path: "new" });
    this.resource("edit");
    this.resource("product", { path: ":product_id" });
    this.resource("edit-product", { path: ":product_id/edit" });
  });
  this.resource('contact');
  this.resource('contacts', function(){
    this.resource('contacts-map', function () {
    });
  });
  this.resource('more-info');
  this.route('protected');
  this.route('login');

});

export default Router;
