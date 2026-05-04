# ng-select Documentation (Language Dropdown Example)

This document explains one complete `ng-select` implementation based on the **Language** dropdown pattern used in `edit-partner-details`.

---

## 1) What this example covers

- Required Angular module imports
- Required package/theme setup
- TypeScript model and options setup
- HTML `ng-select` tag with all key properties
- CSS styling (base + focused + dropdown panel layering)
- Common mistakes and fixes

---

## 2) Required package

Install if not already installed:

```bash
npm install @ng-select/ng-select
```

---

## 3) Required Angular module imports

Add these in your feature module (example: `doctor.module.ts`):

```ts
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgSelectModule } from '@ng-select/ng-select';

@NgModule({
  declarations: [
    // your components
  ],
  imports: [
    CommonModule,
    FormsModule,
    NgSelectModule
  ]
})
export class YourFeatureModule {}
```

Why:
- `NgSelectModule` -> gives `<ng-select>`
- `FormsModule` -> required for `[(ngModel)]`

---

## 4) Theme import (required for proper default rendering)

Add this in component CSS (or global `styles.css` once):

```css
@import "~@ng-select/ng-select/themes/default.theme.css";
```

---

## 5) TypeScript code (component)

Use this structure in your component `.ts`:

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-language-select-demo',
  templateUrl: './language-select-demo.component.html',
  styleUrls: ['./language-select-demo.component.css']
})
export class LanguageSelectDemoComponent {
  // Model to hold selected values (multiple select => array)
  doctor = {
    language: [] as string[]
  };

  // Dropdown items in object format
  Languages: Array<{ id: string }> = [
    { id: 'Assamese' },
    { id: 'Bengali' },
    { id: 'Bodo' },
    { id: 'Dogri' },
    { id: 'English' },
    { id: 'Gujarati' },
    { id: 'Hindi' },
    { id: 'Kannada' },
    { id: 'Kashmiri' },
    { id: 'Konkani' },
    { id: 'Maithili' },
    { id: 'Malaiyalam' },
    { id: 'Marathi' },
    { id: 'Meitei' },
    { id: 'Nepali' },
    { id: 'Odia' },
    { id: 'Punjabi' },
    { id: 'Sanskrit' },
    { id: 'Santali' },
    { id: 'Sindhi' },
    { id: 'Tamil' },
    { id: 'Telugu' },
    { id: 'Urdu' }
  ];

  // Optional: use this for autosave / API update
  saveData(section: number): void {
    // Example:
    // if (section === 6) {
    //   console.log('Selected languages:', this.doctor.language);
    //   // Call API here
    // }
  }
}
```

---

## 6) HTML code (`ng-select`)

```html
<div class="form-group partner-tab-content wrapper">
  <label class="input-label m-0">
    Languages <span style="color: red">*</span>
  </label>

  <ng-select
    id="language"
    name="language"
    [(ngModel)]="doctor.language"
    [multiple]="true"
    [items]="Languages"
    bindLabel="id"
    bindValue="id"
    placeholder="Select language"
    [appendTo]="'.wrapper'"
    [dropdownPosition]="'auto'"
    (ngModelChange)="saveData(6)">
  </ng-select>
</div>
```

---

## 7) Property-by-property explanation

- `id="language"`  
  HTML id for testing/automation/accessibility hooks.

- `name="language"`  
  Form control name for template-driven forms.

- `[(ngModel)]="doctor.language"`  
  Two-way binding. Selected values are stored in `doctor.language`.

- `[multiple]="true"`  
  Enables multi-select. Model must be an array (`string[]`).

- `[items]="Languages"`  
  Data source list rendered in dropdown.

- `bindLabel="id"`  
  Which object key is shown in UI text.

- `bindValue="id"`  
  Which object key is stored in model values.

- `placeholder="Select language"`  
  Placeholder when nothing is selected.

- `[appendTo]="'.wrapper'"`  
  Appends dropdown panel to wrapper container. Helps when parent has overflow/clipping issues.

- `[dropdownPosition]="'auto'"`  
  Auto decides opening direction up/down based on available space.

- `(ngModelChange)="saveData(6)"`  
  Triggers callback whenever selection changes.

---

## 8) CSS code (matching current project style)

```css
@import "~@ng-select/ng-select/themes/default.theme.css";

/* Input shell style */
.partner-tab-content .ng-select .ng-select-container {
  border: 1.5px solid #e0e6ef !important;
  border-radius: 6px !important;
  font-size: 0.9rem !important;
  transition: border-color 0.2s ease !important;
}

/* Focus style */
.partner-tab-content .ng-select.ng-select-focused .ng-select-container {
  border-color: #007bff !important;
  box-shadow: 0 0 0 0.15rem rgba(0, 123, 255, 0.15) !important;
}

/* Dropdown option text */
.ng-dropdown-panel .ng-option {
  color: #080808 !important;
}

/* Keep dropdown above modals/cards/tables */
.ng-dropdown-panel {
  z-index: 10500 !important;
}

/* Selected chips/value text */
.ng-select .ng-value {
  color: #080303 !important;
}

/* Placeholder color */
.ng-select .ng-placeholder {
  color: #180d0d !important;
}
```

---

## 9) Expected model output

Because `bindValue="id"` and `[multiple]="true"` are used, selected value format is:

```ts
doctor.language = ['English', 'Hindi', 'Tamil'];
```

---

## 10) Validation example (optional)

```ts
if (!this.doctor.language || this.doctor.language.length === 0) {
  // show message: "Please select language from list"
  return;
}
```

---

## 11) Common issues and fixes

1. Dropdown not visible / clipped  
   - Use `[appendTo]="'.wrapper'"` and ensure wrapper exists.
   - Add `.ng-dropdown-panel { z-index: 10500 !important; }`

2. `[(ngModel)]` not working  
   - Ensure `FormsModule` is imported in the same module.

3. Options show empty text  
   - `bindLabel` key must exist in each item.
   - Example item should be `{ id: 'English' }` if `bindLabel="id"`.

4. Model contains whole object, not string  
   - Set `bindValue` to store only the required field.

5. Multi-select behaves like single select  
   - Verify `[multiple]="true"` and model type is array.

---

## 12) Quick copy checklist for new page

- [ ] `npm install @ng-select/ng-select`
- [ ] Import `NgSelectModule` in module
- [ ] Import `FormsModule` in module
- [ ] Add theme import CSS
- [ ] Define `items` array in TS
- [ ] Define model variable in TS
- [ ] Add `<ng-select>` with `bindLabel`, `bindValue`, `[(ngModel)]`
- [ ] Add z-index/overflow-safe CSS if dropdown is inside complex layouts

---

If needed, create the same documentation for **single-select** (`Gender`) or **API-driven specialization select** as a second MD file.
