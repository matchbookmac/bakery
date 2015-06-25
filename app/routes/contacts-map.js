import Ember from 'ember';
import AuthenticatedRouteMixin from 'simple-auth/mixins/authenticated-route-mixin';

export default Ember.Route.extend(AuthenticatedRouteMixin, {
  model: function() {
    var contactCoord = Ember.A();
    var contacts = this.store.find('contact').then(function (contacts) {
      contacts.forEach(function (contact) {
        contactCoord.addObject(
          {title: contact.get('businessName'), lat: contact.get('lat'), lng: contact.get('lng'), body: contact.get('streetAddress') + " " + contact.get('city') + ", " + contact.get('state') + " " + contact.get('zip')}
        )
      });
    });
    return contactCoord;
  },
  renderTemplate: function () {
    this.render({ outlet: 'contactsMap' });
  }
});
