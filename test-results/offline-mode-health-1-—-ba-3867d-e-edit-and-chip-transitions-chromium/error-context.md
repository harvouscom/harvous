# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - region "Notifications alt+T"
    - generic [ref=e5]:
      - link "Harvous" [ref=e9] [cursor=pointer]:
        - /url: https://harvous.com
        - img "Harvous" [ref=e10]
      - generic [ref=e11]:
        - generic [ref=e13]:
          - heading "Open your study Bible." [level=1] [ref=e14]
          - generic [ref=e17]:
            - textbox "Email address" [active] [ref=e18]:
              - /placeholder: Enter your email
            - button "Sign in with email" [disabled] [ref=e19]
        - generic [ref=e20]:
          - paragraph [ref=e21]:
            - text: Don't have an account?
            - link "Sign up →" [ref=e22] [cursor=pointer]:
              - /url: /sign-up?redirect_url=%2F
          - paragraph [ref=e23]: Secured by Clerk
  - generic:
    - generic: DEV MODE
```