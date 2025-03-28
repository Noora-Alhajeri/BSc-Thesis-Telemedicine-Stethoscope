import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import{SocketIoModule} from 'ngx-socket-io'
import { HttpClientModule } from '@angular/common/http';

import { FormsModule } from '@angular/forms';


// Import Firebase modules BY:
// npm install firebase @angular/fire
//import { AngularFireModule } from '@angular/fire/compat';
//import { AngularFireDatabaseModule } from '@angular/fire/compat/database';


// new Firebase  config
const firebaseConfig = {
  apiKey: '##################################',
  authDomain: 'capstone-3c28f.firebaseapp.com',
  projectId: 'capstone-3c28f',
  storageBucket: 'capstone-3c28f.appspot.com',
  messagingSenderId: '514121960547',
  appId: '1:514121960547:web:fc080bc3e16a306554bc56',
  measurementId: 'G-DQR1TQ38B8'
};

/// This link if running localhost: url: 'http://localhost:4000'
/// Deployed link for the folder Socket: url: 'https://socket1-ba5ef2c37ead.herokuapp.com/'
/// Deployed link for the folder Sokcet2: url: 'https://socket-telemedicine-d09997c29ec7.herokuapp.com/'

@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule, SocketIoModule.forRoot({ url: 'https://socket-telemedicine-d09997c29ec7.herokuapp.com/'}), HttpClientModule, FormsModule,
  // Initialize Firebase
  //AngularFireModule.initializeApp(firebaseConfig),
  //AngularFireDatabaseModule // for realtime database
],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  bootstrap: [AppComponent],
})
export class AppModule {}

/// Comments for future users
/// Please note that if you are getting http request errors in the console when using the deployed link, that means that the link is not active
/// Heroku is paid for 5$, you will need to deploy the servers again with your own account if it is inactive or you get errors (Check the manuals)
/// To test on the localhost first check the Back Folder and the comments there for accurate testing
///*********************************************************************************************************///
/// One more thing in the room.page.ts check peer
/// if you are testing it and using the port 3001, do not forget to run "peerjs --port 3001" in your command prompt
///   // Before Deploying in Heroku (localhost testing)
    // const myPeer = new Peer(this.currentUserId, {
    //  host: 'localhost',
    //  port: 3001,
    //});
/// For deployment: the PeerJs-s folder is there check it and deploy it again if you get any errors
