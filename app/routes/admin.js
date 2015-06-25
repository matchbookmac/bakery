import Ember from 'ember';

export default Ember.Route.extend({
  actions: {
    editProduct: function () {
      this.controllerFor('products').setProperties({
        'editing': true,
        'adding': false,
        'viewing': false
      });
    },
    newProduct: function () {
      this.controllerFor('products').setProperties({
        'adding': true,
        'editing': false,
        'viewing': false
      });
    },
    googleLogin: function() {
      this.get('session').authenticate('simple-auth-authenticator:torii', 'google-oauth2');
      return;
    }
  }
});
