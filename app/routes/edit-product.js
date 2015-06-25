import Ember from 'ember';
import AuthenticatedRouteMixin from 'simple-auth/mixins/authenticated-route-mixin';

export default Ember.Route.extend(AuthenticatedRouteMixin, {
  model: function (params) {
    return this.store.find("product", params.product_id);
  },
  renderTemplate: function () {
    this.render('edit-product', {
      into: 'products',
      outlet: 'editProduct'
    });
  }
});
