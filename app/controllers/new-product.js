import Ember from 'ember';

export default Ember.Controller.extend({
  actions: {
    createProduct: function () {
      var product = this.store.createRecord("product", {
        title: this.get("title"),
        description: this.get("description"),
        batchSize: this.get("batchSize"),
        cost: this.get("cost")
      });
      product.save();
    }
  }
});
