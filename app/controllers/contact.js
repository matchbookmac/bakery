import Ember from 'ember';

needs: ['products']

export default Ember.Controller.extend({
  actions: {
    addContact: function() {
      var newContact = this.store.createRecord('contact', {
        businessName: this.get('businessName'),
        emailAddress: this.get('emailAddress'),
        //products: this.get('')
        streetAddress: this.get('streetAddress'),
        city: this.get('city'),
        state: this.get('state'),
        zip: this.get('zip'),
        phone: this.get('phone')
      });

      newContact.save();
      this.setProperties({
        businessName: " ",
        emailAddress: " ",
        streetAddress: " ",
        city: " ",
        state: " ",
        zip: " ",
        phone: " "
      });
      this.transitionToRoute('contact');



    }
  }
});
