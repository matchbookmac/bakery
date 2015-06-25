import Ember from 'ember';

<<<<<<< HEAD


export default Ember.ArrayController.extend({
  needs: ['products', 'contact'],
=======

export default Ember.ArrayController.extend({
  needs: ['products', 'contacts'],
>>>>>>> 7ca41059e83f93eff518341786e85c55728815b9
  selectedProductsList: null,
  isChecked: false,
  actions: {
    contactProducts: function() {
      var selectedProducts = this.get('selectedProductsList');
    },

    checkBox: function(params) {
      var box = this.store.find('product', params.id);
      if (box.selected) {
        box.setProperties({
          selected: false,
        });
      } else {
        box.setProperties({
          selected: true,
        });
      }
    },
    checkboxParseTest: function() {
      var checkedBoxes = [];
      var origObject = this;
      this.forEach(function(item) {
        if (item.get('selected') == true) {
          checkedBoxes.push(item.get('title'));
        }
      });
    }
  }
});
