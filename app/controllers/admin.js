import Ember from 'ember';

export default Ember.Controller.extend({
  needs: ['products'],
  authenticator: 'authenticator:torii'
});
