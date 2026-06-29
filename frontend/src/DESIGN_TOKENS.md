# Design Tokens Reference

Consistent Tailwind CSS utility patterns established across all form/modal/auth pages.
Use these tokens for any new pages to maintain visual consistency.

## Primary Brand Color
- Primary solid: `bg-indigo-600`
- Primary hover: `hover:bg-indigo-700`
- Focus ring: `focus:ring-indigo-600`, `focus:ring-1`
- Focus border: `focus:border-indigo-600`

## Border Radius
- Cards/containers: `rounded-xl`
- Inputs/buttons/selects: `rounded-lg`
- Badges/pills: `rounded-full`

## Shadows
- Cards: `shadow-sm`
- Inputs: `shadow-sm`
- Modals: `shadow-2xl`
- Buttons: `shadow-sm`

## Form Input Token
```
rounded-lg border border-gray-300 px-3.5 py-2.5 text-gray-900 placeholder-gray-400
focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 sm:text-sm transition-colors shadow-sm
```

## Label Token
```
block text-sm font-medium text-gray-700 mb-1.5
```

## Primary Button Token
```
rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm
hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2
disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
```
