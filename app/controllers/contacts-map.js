import Ember from 'ember';

export default Ember.ArrayController.extend({
  authenticator: 'authenticator:torii',
  zoom: 13,
  centerLat: 45.505031,
  centerLng: -122.676350
});
