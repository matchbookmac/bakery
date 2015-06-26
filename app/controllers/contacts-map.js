import Ember from 'ember';

export default Ember.ArrayController.extend({
  authenticator: 'authenticator:torii',
  zoom: 13,
  centerLat: 45.494047,
  centerLng: -122.669260
});
