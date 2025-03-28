import { Component } from '@angular/core';
// import {uuidv4} from 'uuid/dist/v4';
// import uuidv4 from 'uuid/dist/v4';
// import {v4 as uuid} from 'uuid';
import{Router} from "@angular/router";



@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {

  constructor(private router:Router) {}

createRoom(){
  console.log("create room")
  // Dynamic Navigation
  // this.router.navigate([`/${uuidv4()}`]);
  // For generating a random string:
  this.router.navigate([`/${Date.now()}`]);
}


}
