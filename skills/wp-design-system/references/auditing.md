# Auditing an existing design system

## Auditing an existing theme

```bash
# Hard-coded colours outside the token definitions
rg -n "#[0-9a-fA-F]{3,8}\b" --glob '*.{css,scss}' | rg -v ":root|theme\.json|--[a-z]" | head -30

# Font sizes that bypass the scale
rg -n "font-size:\s*[0-9]" --glob '*.{css,scss}' | head -30

# Magic spacing values
rg -n "(margin|padding)[^:]*:\s*[0-9]+px" --glob '*.{css,scss}' | head -30
```

A large count on the first command is the clearest signal that the design system exists only on paper.
