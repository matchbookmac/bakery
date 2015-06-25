import Ember from 'ember';

export default Ember.Controller.extend({
  hideMap: true,
  actions: {
    toggleMap: function () {
      this.get('hideMap') ? this.set('hideMap', false) : this.set('hideMap', true);
    }
  }
});
