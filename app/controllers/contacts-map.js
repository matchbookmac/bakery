import Ember from 'ember';

export default Ember.ArrayController.extend({
  authenticator: 'authenticator:torii',
  zoom: 17,
  centerLat: 45.521856,
  centerLng: -122.674290
});
