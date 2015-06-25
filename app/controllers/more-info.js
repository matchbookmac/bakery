import Ember from 'ember';



export default Ember.ArrayController.extend({
  needs: ['products', 'contact'],
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



      // this is also deprecated
      this.forEach(function(item) {

        // if (origObject.get('item.selected'))
        if (item.get('selected') == true) {
          debugger;
          checkedBoxes.push(item.get('title'));
        }
      });
      debugger;


      // the following is deprecated
      // var checkboxes = document.getElementsByClassName('checkbox');
      // for (var i = 0; i <= checkboxes.length; i++) {
      //   if (checkboxes[i].selected) {
      //     checkedBoxes.push(checkboxes[i]);
      //   }
      // }
    }
  }
});
