import { Directive, Input, ElementRef, OnChanges } from '@angular/core';

@Directive({
  selector: '[srcObject]'
})
export class SrcObjectDirective implements OnChanges {
  @Input('srcObject') srcObject: any;
  constructor(private el: ElementRef) {}
  ngOnChanges() {
    this.el.nativeElement.srcObject = this.srcObject;
  }
}