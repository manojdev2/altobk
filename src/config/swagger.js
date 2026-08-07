import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "UV Charging API",
    version: "1.0.0",
    description: "API documentation for UV Charging backend",
  },
  servers: [
    { url: "http://localhost:3001", description: "Development" },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
  },
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Password Reset", description: "Forgot & reset password flow" },
    { name: "Profile", description: "User profile endpoints (protected)" },
    { name: "Vehicle", description: "User vehicles (protected)" },
    { name: "Location", description: "Saved locations (protected)" },
    { name: "Favourite", description: "Favourite stations (protected)" },
    { name: "Notification", description: "Notification settings (protected)" },
    { name: "Review", description: "Station reviews (protected)" },
    { name: "Station", description: "Nearest stations (protected)" },
    { name: "Vehicle Brand & Model", description: "Select brand, model & add vehicle (protected)" },
    { name: "Booking",  description: "Booking management (protected)" },
    { name: "Payment",  description: "Payment gateways — SSLCommerz, Stripe, Saved Cards (protected)" },
    { name: "Charging", description: "Charging session management (protected)" },
    { name: "Admin Auth", description: "Admin authentication" },
    { name: "Admin Dashboard", description: "Admin dashboard stats" },
    { name: "Admin Brands", description: "Admin vehicle brands CRUD" },
    { name: "Admin Models", description: "Admin vehicle models CRUD" },
    { name: "Admin Stations", description: "Admin charging stations CRUD (auto-geocode from address)" },
    { name: "Admin Users", description: "Admin user management" },
    { name: "Admin Bookings", description: "Admin bookings (read-only)" },
    { name: "Admin Reviews", description: "Admin reviews (read-only)" },
    { name: "Admin Settings", description: "Admin app settings — payment keys, currency, gateway ON/OFF" },
    { name: "App Settings (Public)", description: "Public app settings — safe subset for Flutter startup" },
  ],
  paths: {
    // ─────────────────────────────────────────
    // 1. Register
    // ─────────────────────────────────────────
    "/api/v1/Register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        description: "Creates a new user account and sends a 6-digit OTP to the email (expires in 90 seconds).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["fullName", "phone", "email", "password"],
                properties: {
                  fullName: { type: "string", example: "Sazzad Hossain" },
                  phone: { type: "string", example: "01700000000" },
                  email: { type: "string", example: "sazzad@gmail.com" },
                  password: { type: "string", example: "123456" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP sent successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "OTP has been sent to your email!" },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error or email already registered",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "Email already registered. Please login." },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 2. Login
    // ─────────────────────────────────────────
    "/api/v1/Login": {
      post: {
        tags: ["Auth"],
        summary: "Login with email & password",
        description: "Validates credentials and returns a JWT token along with user info (userId, name, email). No OTP required for login.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "sazzad@gmail.com" },
                  password: { type: "string", example: "123456" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful – JWT token and user info returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Login successful" },
                    token: { type: "string", example: "eyJhbGciOiJIUzI1NiIs..." },
                    userId: { type: "string", example: "665abc123def456789012345" },
                    name: { type: "string", example: "Sazzad Hossain" },
                    email: { type: "string", example: "sazzad@gmail.com" },
                  },
                },
              },
            },
          },
          401: {
            description: "Invalid credentials or unverified account",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "Invalid password" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 3. Verify OTP
    // ─────────────────────────────────────────
    "/api/v1/VerifyOTP": {
      post: {
        tags: ["Auth"],
        summary: "Verify OTP (Login / Register)",
        description: "Verifies the 6-digit OTP. Returns a JWT token on success and sets a cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "otp"],
                properties: {
                  email: { type: "string", example: "sazzad@gmail.com" },
                  otp: { type: "string", example: "123456" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP verified – JWT token returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "OTP verified successfully" },
                    token: { type: "string", example: "eyJhbGciOiJIUzI1NiIs..." },
                  },
                },
              },
            },
          },
          401: {
            description: "Invalid or expired OTP",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "Invalid OTP" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 4. Resend OTP
    // ─────────────────────────────────────────
    "/api/v1/ResendOTP": {
      post: {
        tags: ["Auth"],
        summary: "Resend OTP",
        description: "Generates a new 6-digit OTP and sends it to the email (90 second expiry).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", example: "sazzad@gmail.com" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "New OTP sent",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "New OTP has been sent to your email!" },
                  },
                },
              },
            },
          },
          400: {
            description: "User not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "User not found. Please register first." },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 6. Forgot Password
    // ─────────────────────────────────────────
    "/api/v1/ForgotPassword": {
      post: {
        tags: ["Password Reset"],
        summary: "Forgot Password – Send OTP",
        description: "Sends a 6-digit OTP to the registered email for password reset.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string", example: "sazzad@gmail.com" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP sent for password reset",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "OTP has been sent to your email!" },
                  },
                },
              },
            },
          },
          400: {
            description: "Account not found or not verified",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "No account found with this email" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 7. Verify Forgot Password OTP
    // ─────────────────────────────────────────
    "/api/v1/VerifyForgotOTP": {
      post: {
        tags: ["Password Reset"],
        summary: "Verify Forgot Password OTP",
        description: "Verifies the OTP sent during forgot password. Allows the user to proceed to reset password.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "otp"],
                properties: {
                  email: { type: "string", example: "sazzad@gmail.com" },
                  otp: { type: "string", example: "123456" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "OTP verified – can now reset password",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "OTP verified. You can now reset your password." },
                  },
                },
              },
            },
          },
          401: {
            description: "Invalid or expired OTP",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "Invalid OTP" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 8. Reset Password
    // ─────────────────────────────────────────
    "/api/v1/ResetPassword": {
      post: {
        tags: ["Password Reset"],
        summary: "Create new password",
        description: "Sets a new password after OTP has been verified. Both passwords must match and be at least 6 characters.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "newPassword", "confirmPassword"],
                properties: {
                  email: { type: "string", example: "sazzad@gmail.com" },
                  newPassword: { type: "string", example: "newpass123" },
                  confirmPassword: { type: "string", example: "newpass123" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Password reset successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Password reset successfully. Please login." },
                  },
                },
              },
            },
          },
          400: {
            description: "Validation error or OTP not verified",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "fail" },
                    message: { type: "string", example: "Passwords do not match" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─────────────────────────────────────────
    // 9. Logout
    // ─────────────────────────────────────────
    "/api/v1/UserLogout": {
      get: {
        tags: ["Auth"],
        summary: "Logout user",
        description: "Clears the token cookie and logs the user out.",
        responses: {
          200: {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                  },
                },
              },
            },
          },
        },
      },
    },
    // ─── Get Profile ──────────────────────────────────────────────────────
    "/Profile": {
      get: {
        tags: ["Profile"],
        summary: "Get user profile",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Profile fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        fullName: { type: "string", example: "Alex Martinez" },
                        email: { type: "string", example: "martinez@gmail.com" },
                        phone: { type: "string", example: "01772-337656" },
                        avatar: { type: "string", example: "" },
                        dateOfBirth: { type: "string", example: "11/01/2000" },
                        sessions: { type: "number", example: 24 },
                        kwhUsed: { type: "number", example: 348 },
                        favourites: { type: "number", example: 5 },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised — missing or invalid token" },
          400: { description: "Bad Request" },
        },
      },
    },
    // ─── Update Profile ───────────────────────────────────────────────────
    "/UpdateProfile": {
      put: {
        tags: ["Profile"],
        summary: "Update user profile",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  fullName: { type: "string", example: "John Alex" },
                  phone: { type: "string", example: "01772-337656" },
                  dateOfBirth: { type: "string", example: "11/01/2000" },
                  avatar: { type: "string", example: "https://example.com/avatar.jpg" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Profile updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Profile updated successfully." },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised — missing or invalid token" },
          400: { description: "Bad Request" },
        },
      },
    },

    // ─── Get Saved Locations ──────────────────────────────────────────────
    "/SavedLocations": {
      get: {
        tags: ["Location"],
        summary: "Get user's saved locations",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Saved locations fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: { type: "string" },
                          userId: { type: "string" },
                          stationName: { type: "string", example: "Uk Power Station" },
                          address: { type: "string", example: "San Francisco, USA" },
                          image: { type: "string" },
                          status: { type: "string", example: "Available" },
                          latitude: { type: "number", example: 37.7749 },
                          longitude: { type: "number", example: -122.4194 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Favourite Stations ───────────────────────────────────────────
    "/FavouriteStations": {
      get: {
        tags: ["Favourite"],
        summary: "Get user's favourite stations",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Favourite stations fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: { type: "string" },
                          userId: { type: "string" },
                          stationName: { type: "string", example: "Uk Power Station" },
                          address: { type: "string", example: "San Francisco, USA" },
                          image: { type: "string" },
                          pricePerHour: { type: "string", example: "10$/hr" },
                          status: { type: "string", example: "Available" },
                          latitude: { type: "number", example: 37.7749 },
                          longitude: { type: "number", example: -122.4194 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Notification Settings ────────────────────────────────────────
    "/Notifications": {
      get: {
        tags: ["Notification"],
        summary: "Get user's notification settings",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Notification settings fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        chargingStatusAlerts: { type: "boolean", example: true },
                        lowBatteryAlerts: { type: "boolean", example: false },
                        bookingUpdates: { type: "boolean", example: false },
                        stationUpdates: { type: "boolean", example: false },
                        paymentAndSession: { type: "boolean", example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Notification Inbox (with pagination) ──────────────────────────
    "/NotificationInbox": {
      get: {
        tags: ["Notification"],
        summary: "Get user's notification inbox with pagination & unread count",
        description: "Returns paginated notifications, total count, unread count and total pages.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page",  in: "query", schema: { type: "integer", example: 1 },  description: "Page number (default 1)" },
          { name: "limit", in: "query", schema: { type: "integer", example: 20 }, description: "Items per page (default 20)" },
        ],
        responses: {
          200: {
            description: "Notification inbox fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        notifications: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              _id: { type: "string" },
                              userId: { type: "string" },
                              title: { type: "string", example: "Charging Booking Confirmation" },
                              message: { type: "string", example: "Your booking at GreenCharge Station is confirmed." },
                              type: { type: "string", example: "charging_booking" },
                              isRead: { type: "boolean", example: false },
                              createdAt: { type: "string", example: "2026-02-26T08:00:00.000Z" },
                            },
                          },
                        },
                        unreadCount: { type: "integer", example: 3 },
                        total: { type: "integer", example: 25 },
                        page: { type: "integer", example: 1 },
                        totalPages: { type: "integer", example: 2 },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Mark Single Notification as Read ─────────────────────────────────
    "/notifications/{id}/read": {
      put: {
        tags: ["Notification"],
        summary: "Mark a single notification as read",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Notification ID", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Notification marked as read" },
          400: { description: "Notification not found" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Mark All Notifications as Read ───────────────────────────────────
    "/notifications/all/read": {
      put: {
        tags: ["Notification"],
        summary: "Mark all notifications as read",
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "All notifications marked as read" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Submit Review ────────────────────────────────────────────────────
    "/SubmitReview": {
      post: {
        tags: ["Review"],
        summary: "Submit a review for a charging station",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["stationId", "rating"],
                properties: {
                  stationId: { type: "string", example: "station_abc123" },
                  rating: { type: "number", example: 4, minimum: 1, maximum: 5 },
                  description: { type: "string", example: "Great charging experience, fast and convenient." },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Review submitted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Review submitted successfully." },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        userId: { type: "string" },
                        stationId: { type: "string", example: "station_abc123" },
                        rating: { type: "number", example: 4 },
                        description: { type: "string", example: "Great charging experience." },
                        createdAt: { type: "string", example: "2026-02-26T08:00:00.000Z" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation error — missing stationId or invalid rating" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Delete & Toggle Vehicle ──────────────────────────────────────────
    "/MyVehicles/{id}": {
      delete: {
        tags: ["Vehicle"],
        summary: "Delete a vehicle by ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Vehicle ID to delete",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Vehicle deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Vehicle deleted successfully." },
                  },
                },
              },
            },
          },
          400: { description: "Vehicle not found or unauthorized" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Toggle Vehicle Active/Disable ────────────────────────────────────
    "/MyVehicles/{id}/toggle": {
      put: {
        tags: ["Vehicle"],
        summary: "Toggle vehicle Active / Disable",
        description: "Activating a vehicle will automatically disable all other vehicles for this user.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Vehicle ID to toggle",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Vehicle status toggled successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Vehicle activated successfully." },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        userId: { type: "string" },
                        name: { type: "string", example: "Tesla" },
                        model: { type: "string", example: "Model S" },
                        image: { type: "string" },
                        isActive: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Vehicle not found or access denied" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Nearest Stations ─────────────────────────────────────────────
    "/NearestStations": {
      get: {
        tags: ["Station"],
        summary: "Get nearest charging stations sorted by user's current location",
        description:
          "Pass the user's current latitude & longitude as query parameters. " +
          "The API calculates the real distance from the user to each station using MongoDB `$geoNear` " +
          "and returns all stations (Available + Unavailable) sorted nearest-first. " +
          "Each station includes a computed `distanceKm` and estimated `durationMins`. " +
          "If no coordinates are provided, stations are returned sorted by the static `distanceKm` field.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "latitude",
            in: "query",
            required: false,
            description: "User's current latitude (e.g. from device GPS)",
            schema: { type: "number", example: 23.8103 },
          },
          {
            name: "longitude",
            in: "query",
            required: false,
            description: "User's current longitude (e.g. from device GPS)",
            schema: { type: "number", example: 90.4125 },
          },
        ],
        responses: {
          200: {
            description: "Nearest stations retrieved successfully (sorted by distance from user)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Nearest stations retrieved successfully (sorted by your location)." },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: { type: "string" },
                          name: { type: "string", example: "Charge Point Station" },
                          address: { type: "string", example: "Market Street, San Francisco, CA" },
                          images: {
                            type: "array",
                            items: { type: "string", example: "https://example.com/station.jpg" },
                          },
                          status: { type: "string", enum: ["Available", "Unavailable", "Busy"], example: "Available" },
                          availableIn: { type: "string", example: "Available in 30 minutes" },
                          distanceKm: { type: "number", example: 1.2, description: "Real calculated distance in km" },
                          distanceMeters: { type: "number", example: 1200, description: "Real distance in metres (only when lat/lng provided)" },
                          durationMins: { type: "number", example: 5, description: "Estimated driving time in minutes" },
                          rating: { type: "number", example: 4.8 },
                          reviewCount: { type: "number", example: 128 },
                          pricePerHour: { type: "string", example: "10$/hr" },
                          pricePerHourValue: { type: "number", example: 10, description: "Numeric price per hour for calculation" },
                          taxPercent: { type: "number", example: 5, description: "Tax percentage (e.g. 5 means 5%)" },
                          latitude: { type: "number", example: 37.7749 },
                          longitude: { type: "number", example: -122.4194 },
                          about: { type: "string", example: "Modern EV charging station." },
                          amenities: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                label: { type: "string", example: "Restaurant" },
                                icon:  { type: "string", example: "restaurant" },
                              },
                            },
                          },
                          availableDates: {
                            type: "array",
                            items: { type: "string", example: "06 Jan, Tue" },
                          },
                          slots: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                startTime: { type: "string", example: "10:30 AM" },
                                endTime:   { type: "string", example: "11:30 AM" },
                                isBooked:  { type: "boolean", example: false },
                              },
                            },
                          },
                          qrToken: { type: "string", description: "Unique token embedded in station QR code" },
                          qrCode:  { type: "string", description: "Base64 data-URL of the QR image" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Station Detail (map pin click) ──────────────────────────────
    "/StationDetail/{id}": {
      get: {
        tags: ["Station"],
        summary: "Get full station detail by ID",
        description: "Called when user taps a map pin or 'View Details'. Pass optional `latitude` & `longitude` query params (user's current location) to get real driving distance & duration from Google Distance Matrix API.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Station ID",
            schema: { type: "string" },
          },
          {
            name: "latitude",
            in: "query",
            required: false,
            description: "User's current latitude (for driving distance calculation)",
            schema: { type: "number", example: 23.8103 },
          },
          {
            name: "longitude",
            in: "query",
            required: false,
            description: "User's current longitude (for driving distance calculation)",
            schema: { type: "number", example: 90.4125 },
          },
          {
            name: "date",
            in: "query",
            required: false,
            description: "Selected date for slot availability (e.g. '08 Mar, Sun'). If not provided, defaults to the first available date. Slots will show isBooked based on actual bookings for this date.",
            schema: { type: "string", example: "08 Mar, Sun" },
          },
        ],
        responses: {
          200: {
            description: "Station detail retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Station detail retrieved successfully." },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        name: { type: "string", example: "Charge Point Station" },
                        address: { type: "string", example: "Market Street, San Francisco, CA" },
                        images: {
                          type: "array",
                          description: "Carousel images for the station detail page",
                          items: { type: "string", example: "https://example.com/station1.jpg" },
                        },
                        status: {
                          type: "string",
                          enum: ["Available", "Unavailable", "Busy"],
                          example: "Available",
                        },
                        availableIn: { type: "string", example: "Available in 30 minutes" },
                        distanceKm: { type: "number", example: 5.2, description: "Driving distance in km (from Google Distance Matrix if user lat/lng provided)" },
                        distanceText: { type: "string", example: "5.2 km", description: "Human-readable distance (from Google)" },
                        durationMins: { type: "number", example: 12, description: "Driving duration in minutes (from Google Distance Matrix if user lat/lng provided)" },
                        durationText: { type: "string", example: "12 mins", description: "Human-readable duration (from Google)" },
                        rating: { type: "number", example: 4.8 },
                        reviewCount: { type: "number", example: 128 },
                        pricePerHour: { type: "string", example: "10$/hr" },
                        pricePerHourValue: { type: "number", example: 10, description: "Numeric price per hour for calculation" },
                        taxPercent:  { type: "number", example: 5, description: "Tax percentage (e.g. 5 means 5%)" },
                        latitude: { type: "number", example: 37.7749 },
                        longitude: { type: "number", example: -122.4194 },
                        about: {
                          type: "string",
                          example: "An EV charger station is a dedicated unit that supplies electricity to safely recharge electric vehicles.",
                        },
                        amenities: {
                          type: "array",
                          description: "Available amenities at the station",
                          items: {
                            type: "object",
                            properties: {
                              label: { type: "string", example: "Restaurant" },
                              icon:  { type: "string", example: "restaurant-icon" },
                            },
                          },
                          example: [
                            { label: "Restaurant", icon: "restaurant" },
                            { label: "Wi-Fi",       icon: "wifi" },
                            { label: "Maintenance", icon: "maintenance" },
                            { label: "Shop",        icon: "shop" },
                          ],
                        },
                        availableDates: {
                          type: "array",
                          description: "Selectable dates for booking (auto-generated next 7 days if not set)",
                          items: { type: "string", example: "06 Jan, Tue" },
                          example: ["06 Jan, Tue", "07 Jan, Wed", "08 Jan, Thu"],
                        },
                        selectedDate: { type: "string", example: "06 Jan, Tue", description: "The date used for slot availability computation (from query param or first available date)" },
                        slots: {
                          type: "array",
                          description: "Time slots with isBooked computed from actual bookings for the selectedDate",
                          items: {
                            type: "object",
                            properties: {
                              startTime: { type: "string", example: "10:30 AM" },
                              endTime:   { type: "string", example: "11:30 AM" },
                              isBooked:  { type: "boolean", example: false, description: "Computed per-date from BookingModel (not a static field)" },
                            },
                          },
                          example: [
                            { startTime: "10:30 AM", endTime: "11:30 AM", isBooked: false },
                            { startTime: "11:30 AM", endTime: "12:30 PM", isBooked: false },
                            { startTime: "01:00 PM", endTime: "02:00 PM", isBooked: true  },
                          ],
                        },
                        qrToken: { type: "string", description: "Unique token embedded in station QR code" },
                        qrCode:  { type: "string", description: "Base64 data-URL of the QR image" },
                        reviews: {
                          type: "array",
                          description: "Recent reviews for this station",
                          items: {
                            type: "object",
                            properties: {
                              reviewId:    { type: "string" },
                              rating:      { type: "number", example: 5 },
                              description: { type: "string", example: "Great charging experience!" },
                              userName:    { type: "string", example: "John Doe" },
                              createdAt:   { type: "string", format: "date-time" },
                            },
                          },
                        },
                        reviewCount: { type: "number", example: 10, description: "Total number of reviews" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Station not found" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Available Slots for a Station on a Specific Date ──────────
    "/Stations/{id}/slots": {
      get: {
        tags: ["Station"],
        summary: "Get available time slots for a station on a specific date",
        description: "Returns all time slots for the station with `isBooked` computed from actual bookings on the given date. Use this when the user changes the date picker to refresh slot availability. Also returns `allBooked: true` if every slot is taken on that date.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Station ID",
            schema: { type: "string" },
          },
          {
            name: "date",
            in: "query",
            required: true,
            description: "The selected date string (must match the format from availableDates, e.g. '08 Mar, Sun')",
            schema: { type: "string", example: "08 Mar, Sun" },
          },
        ],
        responses: {
          200: {
            description: "Slots retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Slots retrieved successfully." },
                    data: {
                      type: "object",
                      properties: {
                        stationId:      { type: "string" },
                        stationName:    { type: "string", example: "Charge Point Station" },
                        date:           { type: "string", example: "08 Mar, Sun" },
                        totalSlots:     { type: "number", example: 16 },
                        bookedCount:    { type: "number", example: 3 },
                        availableCount: { type: "number", example: 13 },
                        allBooked:      { type: "boolean", example: false, description: "true if all slots are booked for this date" },
                        slots: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              startTime: { type: "string", example: "08:00 AM" },
                              endTime:   { type: "string", example: "08:30 AM" },
                              isBooked:  { type: "boolean", example: false },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Missing params or station not found" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Vehicle Brands ───────────────────────────────────────────────
    "/VehicleBrands": {
      get: {
        tags: ["Vehicle Brand & Model"],
        summary: "Get all vehicle brands",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Brands fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: { type: "string" },
                          name: { type: "string", example: "Tesla" },
                          image: { type: "string", example: "https://example.com/tesla.png" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Vehicle Models By Brand ──────────────────────────────────────
    "/VehicleModels/{brandId}": {
      get: {
        tags: ["Vehicle Brand & Model"],
        summary: "Get vehicle models by brand ID",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "brandId",
            in: "path",
            required: true,
            description: "Brand ID",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Models fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id: { type: "string" },
                          brandId: { type: "string" },
                          name: { type: "string", example: "Model S" },
                          image: { type: "string", example: "https://example.com/models.png" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Brand not found" },
          401: { description: "Unauthorised" },
        },
      },
    },
    // ─── Get Vehicle Model Detail ─────────────────────────────────────────
    "/VehicleModelDetail/{modelId}": {
      get: {
        tags: ["Vehicle Brand & Model"],
        summary: "Get detail for a specific vehicle model (brand + model + image)",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "modelId",
            in: "path",
            required: true,
            description: "Model ID",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Model detail fetched successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        modelName: { type: "string", example: "Model S" },
                        image: { type: "string", example: "https://example.com/models.png" },
                        brandName: { type: "string", example: "Tesla" },
                        brandImage: { type: "string", example: "https://example.com/tesla.png" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Model not found" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── Get Connector Types (Step 3: Select Your Charging Connector) ─────
    "/ConnectorTypes": {
      get: {
        tags: ["Vehicle Brand & Model"],
        summary: "Get connector type list — Step 3 of Set-Up Your Vehicle",
        description: "Returns static list of supported connector types: CCS, CHAdeMO, Type 2, Tesla Supercharger. Use the `id` field as the `connectorType` value in POST /MyVehicles.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Connector types fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Connector types fetched." },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id:          { type: "string", example: "CCS" },
                          label:       { type: "string", example: "CCS" },
                          description: { type: "string", example: "Combined Charging System — DC fast charging" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── Get & Add Vehicle ────────────────────────────────────────────────
    "/MyVehicles": {
      get: {
        tags: ["Vehicle"],
        summary: "Get user's vehicle list",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Vehicle list retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Vehicle list retrieved successfully." },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          _id:                { type: "string" },
                          userId:             { type: "string" },
                          name:               { type: "string",  example: "Tesla" },
                          model:              { type: "string",  example: "Model 3" },
                          image:              { type: "string" },
                          connectorType:      { type: "string",  example: "CCS" },
                          batteryCapacityKwh: { type: "number",  example: 75 },
                          isActive:           { type: "boolean", example: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
      post: {
        tags: ["Vehicle"],
        summary: "Add a vehicle — final step of Set-Up Your Vehicle flow",
        description: "Called after user completes all 4 steps: Brand → Model → Connector Type → Battery Capacity. Send modelId (from /VehicleModelDetail), connectorType (from /ConnectorTypes), batteryCapacityKwh.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["modelId", "connectorType", "batteryCapacityKwh"],
                properties: {
                  modelId:            { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1", description: "From GET /VehicleModelDetail/:modelId" },
                  connectorType:      { type: "string", example: "CCS", enum: ["CCS", "CHAdeMO", "Type 2", "Tesla Supercharger"], description: "From GET /ConnectorTypes" },
                  batteryCapacityKwh: { type: "number", example: 75, description: "User's battery capacity in kWh (Step 4 input)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Vehicle added successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Vehicle added successfully." },
                    data: {
                      type: "object",
                      properties: {
                        _id:                { type: "string" },
                        name:               { type: "string",  example: "Tesla" },
                        model:              { type: "string",  example: "Model 3" },
                        image:              { type: "string" },
                        connectorType:      { type: "string",  example: "CCS" },
                        batteryCapacityKwh: { type: "number",  example: 75 },
                        isActive:           { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "modelId / connectorType / batteryCapacityKwh required" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ════════════════════════════════════════════════════════════
    // BOOKING
    // ════════════════════════════════════════════════════════════

    // ─── GET + POST /Bookings ────────────────────────────────────────────
    "/Bookings": {
      get: {
        tags: ["Booking"],
        summary: "Get user's booking list",
        description: "Returns all bookings (Upcoming, Completed, Cancelled) sorted newest first.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Booking list retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Booking list retrieved successfully." },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          bookingId:             { type: "string" },
                          // ── Vehicle card ──
                          vehicleName:           { type: "string", example: "Tesla" },
                          vehiclePlate:          { type: "string", example: "Model 3" },
                          vehicleImage:          { type: "string" },
                          // ── Station card ──
                          stationName:           { type: "string", example: "Shell Recharge Station" },
                          address:               { type: "string", example: "123 Main St, Downtown" },
                          stationImage:          { type: "string" },
                          // ── Charger specs ──
                          connectorType:         { type: "string", example: "Type A" },
                          energyKwh:             { type: "string", example: "110 kw/h" },
                          chargingSlot:          { type: "string", example: "Slot A" },
                          chargerType:           { type: "string", example: "CCS - 150 kW" },
                          // ── Booking timing ──
                          bookingDate:           { type: "string", example: "Fri, January 02, 2026" },
                          chargingDuration:      { type: "string", example: "45 minutes" },
                          chargingSessionTiming: { type: "string", example: "10:30 AM" },
                          slotStart:             { type: "string", example: "10:30 AM" },
                          slotEnd:               { type: "string", example: "11:30 AM" },
                          // ── Payment summary ──
                          amountEstimation:      { type: "number", example: 450 },
                          tax:                   { type: "number", example: 5 },
                          totalAmount:           { type: "number", example: 455 },
                          isPaid:                { type: "boolean", example: false },
                          status: {
                            type: "string",
                            enum: ["Upcoming", "Completed", "Cancelled"],
                            example: "Upcoming",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
      post: {
        tags: ["Booking"],
        summary: "Create a new booking",
        description: "Book a charging station slot. Pass View Details screen data. Backend auto-calculates duration, amount & tax from station price. Active vehicle is auto-attached. Returns full Booking Details screen data.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["stationId", "date", "slotStart", "slotEnd"],
                properties: {
                  stationId:     { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1", description: "Station ID from View Details" },
                  date:          { type: "string", example: "06 Jan, Tue",               description: "Selected date from date picker" },
                  slotStart:     { type: "string", example: "10:30 AM",                  description: "Selected slot start time" },
                  slotEnd:       { type: "string", example: "11:30 AM",                  description: "Selected slot end time" },
                  connectorType: { type: "string", example: "Type A",                    description: "Connector type (optional, defaults to Type A)" },
                  energyKwh:     { type: "string", example: "110 kw/h",                  description: "Energy (optional)" },
                  chargingSlot:  { type: "string", example: "Slot A",                    description: "Slot label (optional)" },
                  chargerType:   { type: "string", example: "CCS - 150 kW",              description: "Charger type (optional)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Booking created — returns full Booking Details screen data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Booking created successfully." },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:             { type: "string" },
                        // Vehicle card
                        vehicleName:           { type: "string", example: "Honda CR-V" },
                        vehiclePlate:          { type: "string", example: "CR-12-AF_3456" },
                        vehicleImage:          { type: "string" },
                        // Station card
                        stationName:           { type: "string", example: "San Francisco Power Station" },
                        address:               { type: "string", example: "San Francisco, USA" },
                        stationImage:          { type: "string" },
                        // Charger specs row
                        connectorType:         { type: "string", example: "Type A" },
                        energyKwh:             { type: "string", example: "110 kw/h" },
                        chargingSlot:          { type: "string", example: "Slot A" },
                        chargerType:           { type: "string", example: "CCS - 150 kW" },
                        // Booking timing rows
                        bookingDate:           { type: "string", example: "Fri, January 02, 2026" },
                        chargingDuration:      { type: "string", example: "45 minutes" },
                        chargingSessionTiming: { type: "string", example: "10:30 AM" },
                        slotStart:             { type: "string", example: "10:30 AM" },
                        slotEnd:               { type: "string", example: "11:30 AM" },
                        // Payment summary
                        amountEstimation:      { type: "number", example: 450 },
                        tax:                   { type: "number", example: 5 },
                        totalAmount:           { type: "number", example: 455 },
                        isPaid:                { type: "boolean", example: false },
                        status:                { type: "string", example: "Upcoming" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Missing required fields or station unavailable" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── PUT /Bookings/:id/reschedule (Re-Booking) ───────────────────────
    "/Bookings/{id}/reschedule": {
      put: {
        tags: ["Booking"],
        summary: "Reschedule a booking (Re-Booking)",
        description: "Select a new date and time slot for an Upcoming booking.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Booking ID to reschedule",
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["date", "time"],
                properties: {
                  date:      { type: "string", example: "Jan 14, 2026" },
                  time:      { type: "string", example: "11:30 AM" },
                  slotStart: { type: "string", example: "11:30 AM" },
                  slotEnd:   { type: "string", example: "12:30 PM" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Booking rescheduled successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Booking rescheduled successfully." },
                    data: {
                      type: "object",
                      description: "Full booking object from database",
                      properties: {
                        _id:              { type: "string" },
                        userId:           { type: "string" },
                        stationId:        { type: "string" },
                        stationName:      { type: "string", example: "Shell Recharge Station" },
                        address:          { type: "string" },
                        stationImage:     { type: "string" },
                        vehicleName:      { type: "string" },
                        vehiclePlate:     { type: "string" },
                        vehicleImage:     { type: "string" },
                        connectorType:    { type: "string" },
                        energyKwh:        { type: "string" },
                        chargingSlot:     { type: "string" },
                        chargerType:      { type: "string" },
                        date:             { type: "string", example: "Jan 14, 2026" },
                        time:             { type: "string", example: "11:30 AM" },
                        slotStart:        { type: "string", example: "11:30 AM" },
                        slotEnd:          { type: "string", example: "12:30 PM" },
                        chargingDuration: { type: "string" },
                        amountEstimation: { type: "number" },
                        tax:              { type: "number" },
                        totalAmount:      { type: "number" },
                        isPaid:           { type: "boolean" },
                        status:           { type: "string", example: "Upcoming" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found, or Cancelled/Completed booking cannot be rescheduled" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── PUT /Bookings/:id/cancel ────────────────────────────────────────
    "/Bookings/{id}/cancel": {
      put: {
        tags: ["Booking"],
        summary: "Cancel a booking",
        description: "Cancel an Upcoming booking. Completed bookings cannot be cancelled.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Booking ID to cancel",
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Booking cancelled successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Booking cancelled successfully." },
                    data: {
                      type: "object",
                      description: "Full booking object from database with status set to Cancelled",
                      properties: {
                        _id:              { type: "string" },
                        userId:           { type: "string" },
                        stationId:        { type: "string" },
                        stationName:      { type: "string", example: "Shell Recharge Station" },
                        address:          { type: "string" },
                        stationImage:     { type: "string" },
                        vehicleName:      { type: "string" },
                        vehiclePlate:     { type: "string" },
                        vehicleImage:     { type: "string" },
                        connectorType:    { type: "string" },
                        energyKwh:        { type: "string" },
                        chargingSlot:     { type: "string" },
                        chargerType:      { type: "string" },
                        date:             { type: "string" },
                        time:             { type: "string" },
                        slotStart:        { type: "string" },
                        slotEnd:          { type: "string" },
                        chargingDuration: { type: "string" },
                        amountEstimation: { type: "number" },
                        tax:              { type: "number" },
                        totalAmount:      { type: "number" },
                        isPaid:           { type: "boolean" },
                        status:           { type: "string", example: "Cancelled" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found or already Cancelled/Completed" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PAYMENT
    // ════════════════════════════════════════════════════════════

    // ─── GET /Bookings/:id/payment  (Screen 2 – Payment Method) ─────────
    "/Bookings/{id}/payment": {
      get: {
        tags: ["Payment"],
        summary: "Get payment method screen data",
        description: "Returns booking summary (date, duration, amounts), user's saved cards, and available payment gateways (SSLCommerz, Stripe, Saved Card). Called when user taps 'Proceed to Pay'.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Payment method data retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Payment method retrieved successfully." },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:        { type: "string" },
                        date:             { type: "string", example: "Fri, January 02, 2026" },
                        time:             { type: "string", example: "04:30 PM" },
                        chargingDuration: { type: "string", example: "45 minutes" },
                        amountEstimation: { type: "number", example: 450 },
                        tax:              { type: "number", example: 5 },
                        totalAmount:      { type: "number", example: 455 },
                        isPaid:           { type: "boolean", example: false },
                        paymentStatus:    { type: "string", example: "", description: "pending | paid | failed | cancelled" },
                        paymentGateway:   { type: "string", example: "", description: "sslcommerz | stripe | card" },
                        stripePublishableKey: { type: "string", example: "pk_test_...", description: "Stripe publishable key — Flutter needs this to init Stripe SDK" },
                        availableGateways: {
                          type: "array",
                          description: "Payment gateway options for the user to choose from",
                          items: {
                            type: "object",
                            properties: {
                              id:          { type: "string", example: "sslcommerz" },
                              name:        { type: "string", example: "SSLCommerz" },
                              description: { type: "string", example: "Pay via bKash, Nagad, Cards, Mobile Banking" },
                              minAmount:   { type: "number", example: 10, description: "Minimum amount for this gateway (BDT)" },
                            },
                          },
                          example: [
                            { id: "sslcommerz", name: "SSLCommerz", description: "Pay via bKash, Nagad, Cards, Mobile Banking", minAmount: 10 },
                            { id: "stripe",     name: "Stripe",     description: "Pay via International Cards", minAmount: 100 },
                            { id: "card",       name: "Saved Card", description: "Pay using a saved payment card", minAmount: 0 },
                          ],
                        },
                        cards: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              cardId:     { type: "string" },
                              cardType:   { type: "string", example: "Visa" },
                              cardHolder: { type: "string", example: "John Doe" },
                              last4:      { type: "string", example: "2345" },
                              expiryDate: { type: "string", example: "12/27" },
                              isDefault:  { type: "boolean", example: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found" },
          401: { description: "Unauthorised" },
        },
      },

      // ─── POST /Bookings/:id/payment  (Confirm Payment → Screen 3) ──────
      post: {
        tags: ["Payment"],
        summary: "Confirm payment — SSLCommerz / Stripe / Saved Card",
        description: `Initiate payment for a booking. Send **paymentMethod** to choose the gateway.\n
**SSLCommerz** → returns \`gatewayUrl\` — open in WebView, poll \`GET /payment/status/booking/:id\` after redirect.\n
**Stripe** → Step 1: omit \`stripePaymentIntentId\` → returns \`clientSecret\` — confirm on device with Stripe SDK. Step 2: send \`stripePaymentIntentId\` to verify → returns booking success.\n
**card** (or omit paymentMethod) → legacy saved-card flow, marks paid instantly.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  paymentMethod:         { type: "string", enum: ["sslcommerz", "stripe", "card"], example: "sslcommerz", description: "Choose payment gateway" },
                  cardId:                { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1", description: "Required when paymentMethod = card" },
                  stripePaymentIntentId: { type: "string", example: "pi_3abc123...", description: "Send after Stripe SDK confirms on device (Step 2)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Response varies by gateway",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string" },
                    data: {
                      type: "object",
                      description: "Response shape depends on paymentMethod",
                      properties: {
                        bookingId:       { type: "string" },
                        paymentMethod:   { type: "string", example: "sslcommerz" },
                        gatewayUrl:      { type: "string", example: "https://sandbox.sslcommerz.com/gwprocess/v4/...", description: "SSLCommerz only — open in WebView" },
                        transactionId:   { type: "string", description: "SSLCommerz only" },
                        clientSecret:    { type: "string", example: "pi_xxx_secret_yyy", description: "Stripe Step 1 only — pass to Stripe SDK" },
                        paymentIntentId: { type: "string", description: "Stripe Step 1 only" },
                        publishableKey:  { type: "string", example: "pk_test_...", description: "Stripe Step 1 only — Stripe publishable key for SDK init" },
                        title:           { type: "string", example: "Booking Successfully", description: "Stripe Step 2 / Card only" },
                        subtitle:        { type: "string", example: "Your Charging Spot has been Confirmed" },
                        date:            { type: "string" },
                        location:        { type: "string" },
                        time:            { type: "string" },
                        stationName:     { type: "string" },
                        totalAmount:     { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found, already paid, cancelled, or gateway error" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /PaymentCards  (Add Card) ──────────────────────────────────
    "/PaymentCards": {
      post: {
        tags: ["Payment"],
        summary: "Add a payment card",
        description: "Saves a new card for the user. First card is auto-set as default.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cardNumber"],
                properties: {
                  cardHolder:  { type: "string", example: "John Doe" },
                  cardNumber:  { type: "string", example: "4111 1111 1111 2345" },
                  expiryDate:  { type: "string", example: "12/27" },
                  cardType:    { type: "string", example: "Visa" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Card added successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Card added successfully." },
                    data: {
                      type: "object",
                      properties: {
                        cardId:     { type: "string" },
                        cardType:   { type: "string", example: "Visa" },
                        cardHolder: { type: "string", example: "John Doe" },
                        last4:      { type: "string", example: "2345" },
                        expiryDate: { type: "string", example: "12/27" },
                        isDefault:  { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Card number is required" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── GET /Bookings/:id/navigate  (Screen 2 — Navigate to Station) ───
    "/Bookings/{id}/navigate": {
      get: {
        tags: ["Booking"],
        summary: "Get navigation data — Navigate to Station",
        description: "Called when user taps 'Go to Station' on booking success screen. Returns station coordinates, direction text and trip info for map navigation.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Navigation data retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Navigation data retrieved successfully." },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:      { type: "string" },
                        // ── Top direction banner ──
                        directionText:  { type: "string",  example: "Go Straight towards, SanFrancisco Power Station" },
                        distanceBanner: { type: "string",  example: "800 M" },
                        // ── Station map pin ──
                        stationName:    { type: "string",  example: "San Francisco Power Station" },
                        stationImage:   { type: "string" },
                        latitude:       { type: "number",  example: 37.7749 },
                        longitude:      { type: "number",  example: -122.4194 },
                        // ── Bottom info bar ──
                        durationMins:   { type: "number",  example: 35 },
                        distanceKm:     { type: "number",  example: 5.6 },
                        arrivalTime:    { type: "string",  example: "11:00 AM" },
                        hasArrived:     { type: "boolean", example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found or not yet paid" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /Bookings/:id/arrive  (Screen 4 — Arrival Confirm popup) ──
    "/Bookings/{id}/arrive": {
      post: {
        tags: ["Booking"],
        summary: "Confirm arrival at station — Arrival Confirm popup",
        description: "Called when user's car reaches the station on the map. Performs a 20-metre proximity check using Haversine formula. Send optional latitude/longitude in the body for the check. Returns popup data: arrivalStatus, stationName, description.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  latitude:  { type: "number", example: 37.7749, description: "User's current latitude (for 20m proximity check)" },
                  longitude: { type: "number", example: -122.4194, description: "User's current longitude (for 20m proximity check)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Arrival confirmed — shows Arrival Confirm popup",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Arrival confirmed successfully." },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:     { type: "string" },
                        popupTitle:    { type: "string",  example: "Arrival Confirm" },
                        arrivalStatus: { type: "string",  example: "Confirmed" },
                        stationName:   { type: "string",  example: "San Francisco" },
                        description:   { type: "string",  example: "You've arrived at the charging station. Plug in your vehicle to start charging." },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found, not paid, or arrival already confirmed" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── PUT /Bookings/{id}/location  — Mobile pushes car location ──────
    "/Bookings/{id}/location": {
      put: {
        tags: ["Booking"],
        summary: "Update real-time car location during navigation",
        description: "Mobile app calls this every few seconds with the car's current GPS coordinates. Server stores the location and returns Haversine-calculated distance, duration and ETA to the station.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["latitude", "longitude"],
                properties: {
                  latitude:  { type: "number", example: 37.7741, description: "Car's current latitude" },
                  longitude: { type: "number", example: -122.4180, description: "Car's current longitude" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Location stored — returns updated distance/ETA",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Location updated." },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:      { type: "string" },
                        userLat:        { type: "number",  example: 37.7741 },
                        userLng:        { type: "number",  example: -122.4180 },
                        lastLocationAt: { type: "string",  format: "date-time" },
                        distanceM:      { type: "number",  example: 800, description: "Distance to station in metres" },
                        distanceBanner: { type: "string",  example: "800 M", description: "Human-readable: '800 M' or '1.2 KM'" },
                        durationMins:   { type: "number",  example: 2, description: "Estimated minutes to reach station" },
                        eta:            { type: "string",  example: "11:05 AM", description: "Estimated arrival time" },
                        stationLat:     { type: "number",  example: 37.7749 },
                        stationLng:     { type: "number",  example: -122.4194 },
                        stationName:    { type: "string",  example: "San Francisco Power Station" },
                        stationImage:   { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "latitude and longitude are required / Booking not found" },
          401: { description: "Unauthorised" },
        },
      },
      get: {
        tags: ["Booking"],
        summary: "Get latest car location (polling)",
        description: "Returns the last known GPS position of the car pushed via PUT. Use this from another device or admin dashboard to track the car.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Latest location returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Location fetched." },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:      { type: "string" },
                        userLat:        { type: "number",  example: 37.7741 },
                        userLng:        { type: "number",  example: -122.4180 },
                        lastLocationAt: { type: "string",  format: "date-time" },
                        hasArrived:     { type: "boolean", example: false },
                        stationLat:     { type: "number",  example: 37.7749 },
                        stationLng:     { type: "number",  example: -122.4194 },
                        stationName:    { type: "string",  example: "San Francisco Power Station" },
                        stationImage:   { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ══════════════════════════════════════════════════════════
    // CHARGING SESSION ENDPOINTS
    // ══════════════════════════════════════════════════════════

    // ─── POST /ChargingSession/validate-qr  — Validate QR Code ──────────
    "/ChargingSession/validate-qr": {
      post: {
        tags: ["Charging"],
        summary: "Validate QR Code — after Flutter scans the station QR",
        description: "Called after the user scans a station's QR code. Validates the QR token against the station, finds the user's active booking (paid + arrived + upcoming), and returns or creates a charging session. Returns sessionId for all subsequent charging calls.",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["stationId", "qrToken"],
                properties: {
                  stationId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1", description: "Station ID from QR code" },
                  qrToken:   { type: "string", example: "abc123xyz", description: "Unique token embedded in QR code" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "QR validated — session ready",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "QR code validated. Ready to start charging." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:        { type: "string" },
                        bookingId:        { type: "string" },
                        stationName:      { type: "string", example: "Power Station" },
                        address:          { type: "string", example: "San Francisco, USA" },
                        stationImage:     { type: "string" },
                        slotLabel:        { type: "string", example: "Slot A" },
                        connectorType:    { type: "string", example: "Type A" },
                        chargingDuration: { type: "string", example: "60 Min" },
                        sessionTime:      { type: "string", example: "3:30 PM" },
                        status:           { type: "string", example: "NotStarted", enum: ["NotStarted","Charging","Stopped","Completed"] },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Missing stationId/qrToken, station not found, invalid QR, no active booking" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── GET /ChargingStation/:bookingId  — Screen 1: In Charging Station ──
    "/ChargingStation/{bookingId}": {
      get: {
        tags: ["Charging"],
        summary: "In Charging Station — View Details after arrival",
        description: "Called when user clicks 'View Details' on the Arrival Confirm popup. Returns station info, slot, connector, session time and a sessionId to use for all subsequent charging calls.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "bookingId", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Charging station info fetched",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Charging station info fetched." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:        { type: "string" },
                        bookingId:        { type: "string" },
                        stationName:      { type: "string",  example: "Power Station" },
                        address:          { type: "string",  example: "San Francisco, USA" },
                        stationImage:     { type: "string" },
                        slotLabel:        { type: "string",  example: "Slot A" },
                        connectorType:    { type: "string",  example: "Type A" },
                        chargingDuration: { type: "string",  example: "60 Min" },
                        sessionTime:      { type: "string",  example: "3:30 PM" },
                        status:           { type: "string",  example: "NotStarted", enum: ["NotStarted","Charging","Stopped","Completed"] },
                        canScan:          { type: "boolean", example: true, description: "Show 'Scan Code to Start Charging' button" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Booking not found / not paid / arrival not confirmed" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /ChargingSession/:id/start  — Screen 2: Charging Started Successfully ──
    "/ChargingSession/{id}/start": {
      post: {
        tags: ["Charging"],
        summary: "Start Charging — show 'Charging Started Successfully' popup",
        description: "Called after QR scan. Returns popup data: batteryPercent, kwhUsedSoFar, confirmMessage. User sees 'Start Charging' / 'Stop Charging' buttons.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID (from GetChargingStation)", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Charging started — popup data returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Charging started successfully." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:        { type: "string" },
                        bookingId:        { type: "string" },
                        popupTitle:       { type: "string",  example: "Charging Started Successfully" },
                        batteryPercent:   { type: "number",  example: 85 },
                        kwhUsedSoFar:     { type: "number",  example: 25.4 },
                        confirmMessage:   { type: "string",  example: "Your car is 85% charged and has used 25.4 kwh so far." },
                        chargingDuration: { type: "string",  example: "60 Min" },
                        timeRemainingMs:  { type: "number",  example: 3600000 },
                        startedAt:        { type: "string",  format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Session not found / already started / already ended" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── GET /ChargingSession/:id/status  — Screen 3: Live Charging (45%, 00:18:30) ──
    "/ChargingSession/{id}/status": {
      get: {
        tags: ["Charging"],
        summary: "Live charging status — battery %, time remaining, kwh used",
        description: "Poll every few seconds to update the charging screen. Returns batteryPercent, timeRemaining (HH:MM:SS), kwhUsed.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Live status returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Charging status fetched." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:      { type: "string" },
                        bookingId:      { type: "string" },
                        chargingStatus: { type: "string",  example: "Charging" },
                        batteryPercent: { type: "number",  example: 45 },
                        timeRemaining:  { type: "string",  example: "00:18:30" },
                        kwhUsed:        { type: "number",  example: 25.4 },
                        canStop:        { type: "boolean", example: true },
                        canExtend:      { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Session not found" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /ChargingSession/:id/stop  — Screen 4: Stop Charging ──────
    "/ChargingSession/{id}/stop": {
      post: {
        tags: ["Charging"],
        summary: "Stop Charging — confirm dialog + Charging Stopped screen",
        description: "Called when user confirms 'Stop Charging'. Marks session as Stopped, booking as Completed. Returns summary: energyDelivered, costPerKwh, extendSessionCharge, totalAmount.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Charging stopped — summary returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Charging stopped. Booking confirmed." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:           { type: "string" },
                        bookingId:           { type: "string" },
                        popupTitle:          { type: "string",  example: "Charging Stopped" },
                        subTitle:            { type: "string",  example: "Your booking is confirmed!" },
                        energyDelivered:     { type: "number",  example: 25.4, description: "kwh" },
                        costPerKwh:          { type: "number",  example: 0.75 },
                        extendSessionCharge: { type: "number",  example: 175 },
                        totalAmount:         { type: "number",  example: 455 },
                        needsPayment:        { type: "boolean", example: true, description: "true if extensions exist → show 'Proceed to Pay', false → show 'Confirm'" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Session not found / not currently charging" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /ChargingSession/:id/extend  — Screen 5: Extend Session ───
    "/ChargingSession/{id}/extend": {
      post: {
        tags: ["Charging"],
        summary: "Extend Session — add 10/20/30/50 minutes",
        description: "User picks an extension option from the bottom-sheet. Send extendMins (10|20|30|50).",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["extendMins"],
                properties: {
                  extendMins: { type: "number", example: 30, enum: [10, 20, 30, 50], description: "Minutes to extend" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Session extended",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Session extended by 30 minutes." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:          { type: "string" },
                        extendMins:         { type: "number",  example: 30 },
                        estimatedCost:      { type: "number",  example: 100 },
                        newTimeRemainingMs: { type: "number",  example: 5400000 },
                        options: {
                          type: "array",
                          description: "All available extension options for UI radio buttons",
                          items: {
                            type: "object",
                            properties: {
                              label: { type: "string",  example: "Extend For 30 Min" },
                              mins:  { type: "number",  example: 30 },
                              cost:  { type: "number",  example: 100 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "extendMins required / Session not found / not charging" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── GET /ChargingSession/:id/summary  — Screen 6: Charging Stopped ─
    "/ChargingSession/{id}/summary": {
      get: {
        tags: ["Charging"],
        summary: "Charging session summary — Proceed to Pay screen",
        description: "Returns full cost breakdown after session ends: energyDelivered, costPerKwh, extendSessionCharge, totalAmount. Shows 'Proceed to Pay' button.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Summary returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Charging summary fetched." },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:           { type: "string" },
                        bookingId:           { type: "string" },
                        heading:             { type: "string",  example: "Charging Stopped" },
                        subHeading:          { type: "string",  example: "Your booking is confirmed!" },
                        energyDelivered:     { type: "number",  example: 25.4 },
                        costPerKwh:          { type: "number",  example: 0.75 },
                        extendSessionCharge: { type: "number",  example: 175 },
                        totalAmount:         { type: "number",  example: 455 },
                        needsPayment:        { type: "boolean", example: true, description: "true → 'Proceed to Pay' (extensions), false → already confirmed" },
                        showReviewPrompt:    { type: "boolean", example: true, description: "Show Give Review bottom-sheet (true when status is Completed)" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Session not found / session not ended yet" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /ChargingSession/:id/pay  — Pay Extension Charges ─────────
    "/ChargingSession/{id}/pay": {
      post: {
        tags: ["Payment"],
        summary: "Pay extension charges — SSLCommerz / Stripe / Card",
        description: `Pay the extension charges after a charging session is stopped (when session has extendSessionCharge > 0).\n
**SSLCommerz** → returns \`gatewayUrl\` — open in WebView, poll \`GET /payment/status/session/:id\` after redirect.\n
**Stripe** → Step 1: omit \`stripePaymentIntentId\` → returns \`clientSecret\` — confirm on device. Step 2: send \`stripePaymentIntentId\` → verifies & marks Completed.\n
**card** (or omit paymentMethod) → marks session Completed instantly.`,
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  paymentMethod:         { type: "string", enum: ["sslcommerz", "stripe", "card"], example: "sslcommerz", description: "Choose payment gateway" },
                  stripePaymentIntentId: { type: "string", example: "pi_3abc123...", description: "Send after Stripe SDK confirms on device (Step 2)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Response varies by gateway",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:        { type: "string" },
                        bookingId:        { type: "string" },
                        paymentMethod:    { type: "string", example: "sslcommerz" },
                        gatewayUrl:       { type: "string", description: "SSLCommerz only — open in WebView" },
                        transactionId:    { type: "string", description: "SSLCommerz only" },
                        clientSecret:     { type: "string", description: "Stripe Step 1 only" },
                        paymentIntentId:  { type: "string", description: "Stripe Step 1 only" },
                        publishableKey:   { type: "string", example: "pk_test_...", description: "Stripe Step 1 only — Stripe publishable key for SDK init" },
                        extensionPaid:    { type: "number",  example: 175, description: "Stripe Step 2 / Card only" },
                        totalAmount:      { type: "number",  example: 455 },
                        status:           { type: "string",  example: "Completed" },
                        showReviewPrompt: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Session not found, not stopped, no extension charges, or gateway error" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── POST /ChargingSession/:id/review  — Give Review bottom-sheet ───
    "/ChargingSession/{id}/review": {
      post: {
        tags: ["Charging"],
        summary: "Give Review — after Proceed to Pay",
        description: "Called when user submits the 'Give Review' bottom-sheet after charging ends. stationId is resolved automatically from the session — frontend only needs to send rating (1-5) and optional description.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["rating"],
                properties: {
                  rating:      { type: "number", example: 5, minimum: 1, maximum: 5, description: "Star rating 1–5" },
                  description: { type: "string", example: "Great charging experience!", description: "Optional review text" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Review submitted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status:  { type: "string", example: "Success" },
                    message: { type: "string", example: "Review submitted successfully." },
                    data: {
                      type: "object",
                      properties: {
                        reviewId:    { type: "string" },
                        sessionId:   { type: "string" },
                        bookingId:   { type: "string" },
                        stationName: { type: "string",  example: "San Francisco Power Station" },
                        rating:      { type: "number",  example: 5 },
                        description: { type: "string",  example: "Great charging experience!" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Session not found / session not ended / review already submitted" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ═══════════════════════════════════════════════════════
    // ADMIN ENDPOINTS
    // ═══════════════════════════════════════════════════════

    // ─────────────────────────────────────────
    // Admin Login
    // ─────────────────────────────────────────
    "/api/v1/admin/login": {
      post: {
        tags: ["Admin Auth"],
        summary: "Admin login",
        description: "Authenticates an admin and returns a JWT token.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "admin@uvcharging.com" },
                  password: { type: "string", example: "Admin@1234" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Admin login successful." },
                    token: { type: "string", example: "eyJhbGciOiJIUzI1NiIs..." },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        name: { type: "string", example: "Super Admin" },
                        email: { type: "string", example: "admin@uvcharging.com" },
                        role: { type: "string", example: "superadmin" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Invalid credentials" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Seed
    // ─────────────────────────────────────────
    "/api/v1/admin/seed": {
      post: {
        tags: ["Admin Auth"],
        summary: "Seed first admin",
        description: "Creates the first super admin account. Can only be run once.",
        responses: {
          200: {
            description: "Admin seeded",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Admin seeded." },
                    data: {
                      type: "object",
                      properties: {
                        email: { type: "string", example: "admin@uvcharging.com" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Admin already seeded" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Dashboard
    // ─────────────────────────────────────────
    "/api/v1/admin/dashboard": {
      get: {
        tags: ["Admin Dashboard"],
        summary: "Dashboard statistics",
        description: "Returns total users, bookings, stations, sessions, reviews, brands, and revenue.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Dashboard stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        totalUsers: { type: "number", example: 150 },
                        totalBookings: { type: "number", example: 320 },
                        totalStations: { type: "number", example: 25 },
                        totalSessions: { type: "number", example: 280 },
                        totalReviews: { type: "number", example: 90 },
                        totalBrands: { type: "number", example: 12 },
                        totalRevenue: { type: "number", example: 45000 },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Brands
    // ─────────────────────────────────────────
    "/api/v1/admin/brands": {
      get: {
        tags: ["Admin Brands"],
        summary: "Get all vehicle brands",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "List of brands",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: { type: "array", items: { type: "object", properties: { _id: { type: "string" }, name: { type: "string", example: "Tesla" }, image: { type: "string" } } } },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
      post: {
        tags: ["Admin Brands"],
        summary: "Create a vehicle brand",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Tesla" },
                  image: { type: "string", example: "https://example.com/tesla.png" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Brand created" },
          400: { description: "Validation error" },
          401: { description: "Unauthorised" },
        },
      },
    },
    "/api/v1/admin/brands/{id}": {
      put: {
        tags: ["Admin Brands"],
        summary: "Update a vehicle brand",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Tesla Updated" },
                  image: { type: "string", example: "https://example.com/tesla2.png" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Brand updated" },
          400: { description: "Brand not found" },
          401: { description: "Unauthorised" },
        },
      },
      delete: {
        tags: ["Admin Brands"],
        summary: "Delete a vehicle brand",
        description: "Deletes the brand and all associated models.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Brand and its models deleted" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Models
    // ─────────────────────────────────────────
    "/api/v1/admin/models": {
      get: {
        tags: ["Admin Models"],
        summary: "Get all vehicle models",
        description: "Optionally filter by brandId query parameter.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "brandId", in: "query", required: false, schema: { type: "string" }, description: "Filter by brand ID" }],
        responses: {
          200: {
            description: "List of models",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: { type: "array", items: { type: "object", properties: { _id: { type: "string" }, brandId: { type: "object" }, name: { type: "string", example: "Model 3" }, image: { type: "string" } } } },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
      post: {
        tags: ["Admin Models"],
        summary: "Create a vehicle model",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["brandId", "name"],
                properties: {
                  brandId: { type: "string", example: "665abc123def456789012345" },
                  name: { type: "string", example: "Model 3" },
                  image: { type: "string", example: "https://example.com/model3.png" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Model created" },
          400: { description: "Validation error or brand not found" },
          401: { description: "Unauthorised" },
        },
      },
    },
    "/api/v1/admin/models/{id}": {
      put: {
        tags: ["Admin Models"],
        summary: "Update a vehicle model",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Model S" },
                  image: { type: "string", example: "https://example.com/modelS.png" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Model updated" },
          400: { description: "Model not found" },
          401: { description: "Unauthorised" },
        },
      },
      delete: {
        tags: ["Admin Models"],
        summary: "Delete a vehicle model",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Model deleted" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Stations
    // ─────────────────────────────────────────
    "/api/v1/admin/stations": {
      get: {
        tags: ["Admin Stations"],
        summary: "Get all charging stations",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "List of stations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
      post: {
        tags: ["Admin Stations"],
        summary: "Create a charging station (supports image file upload + auto slot generation)",
        description: "Enter an address and latitude/longitude will be auto-fetched via Google Maps. You can upload image files using `multipart/form-data` (field name: `images`) or send image URLs via JSON. Slots are auto-generated using `startHour`, `endHour`, `intervalMin` (defaults: 8, 18, 30).",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["name", "address"],
                properties: {
                  name: { type: "string", example: "Power Station" },
                  address: { type: "string", example: "Mirpur 12, Dhaka, Bangladesh" },
                  status: { type: "string", enum: ["Available", "Unavailable", "Busy"], example: "Available" },
                  availableIn: { type: "string", example: "10 Min" },
                  pricePerHour: { type: "string", example: "$10/hr" },
                  pricePerHourValue: { type: "number", example: 10 },
                  taxPercent: { type: "number", example: 5 },
                  about: { type: "string", example: "Modern EV charging station." },
                  images: { type: "array", items: { type: "string", format: "binary" }, description: "Upload up to 5 image files" },
                  startHour: { type: "number", example: 8, description: "Slot start hour (24h). Default 8 (8 AM)" },
                  endHour: { type: "number", example: 18, description: "Slot end hour (24h). Default 18 (6 PM)" },
                  intervalMin: { type: "number", example: 30, description: "Slot interval in minutes. Default 30" },
                  amenities: { type: "string", description: "JSON stringified array when using multipart. e.g. '[{\"label\":\"Restaurant\",\"icon\":\"restaurant\"},{\"label\":\"Wi-Fi\",\"icon\":\"wifi\"}]'", example: '[{"label":"Restaurant","icon":"restaurant"},{"label":"Wi-Fi","icon":"wifi"}]' },
                },
              },
            },
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "address"],
                properties: {
                  name: { type: "string", example: "Power Station" },
                  address: { type: "string", example: "Mirpur 12, Dhaka, Bangladesh" },
                  status: { type: "string", enum: ["Available", "Unavailable", "Busy"], example: "Available" },
                  availableIn: { type: "string", example: "10 Min" },
                  pricePerHour: { type: "string", example: "$10/hr" },
                  pricePerHourValue: { type: "number", example: 10 },
                  taxPercent: { type: "number", example: 5 },
                  images: { type: "array", items: { type: "string" }, example: ["https://img1.com"] },
                  about: { type: "string", example: "Modern EV charging station." },
                  startHour: { type: "number", example: 8, description: "Slot start hour (24h). Default 8 (8 AM)" },
                  endHour: { type: "number", example: 18, description: "Slot end hour (24h). Default 18 (6 PM)" },
                  intervalMin: { type: "number", example: 30, description: "Slot interval in minutes. Default 30" },
                  amenities: {
                    type: "array",
                    description: "List of amenities. Options: Restaurant, Wi-Fi, Maintenance, Shop, Restroom, Parking, Lounge, Coffee",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", example: "Restaurant" },
                        icon: { type: "string", example: "restaurant", description: "Material icon name" },
                      },
                    },
                    example: [{ label: "Restaurant", icon: "restaurant" }, { label: "Wi-Fi", icon: "wifi" }, { label: "Maintenance", icon: "build" }, { label: "Shop", icon: "shopping_bag" }],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Station created with auto-geocoded lat/long and auto-generated slots",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Station created with 20 slot(s)." },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        name: { type: "string", example: "Power Station" },
                        address: { type: "string", example: "Mirpur 12, Dhaka 1216, Bangladesh" },
                        latitude: { type: "number", example: 23.8103 },
                        longitude: { type: "number", example: 90.3652 },
                        slots: { type: "array", items: { type: "object", properties: { startTime: { type: "string", example: "08:00 AM" }, endTime: { type: "string", example: "08:30 AM" }, isBooked: { type: "boolean", example: false } } } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Validation error" },
          401: { description: "Unauthorised" },
        },
      },
    },
    "/api/v1/admin/stations/{id}": {
      get: {
        tags: ["Admin Stations"],
        summary: "Get a charging station by ID",
        description: "Returns the station including amenities, slots (with `isBooked` computed for the given date), `availableDates`, `selectedDate`, and a `bookingCountsByDate` summary.",
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "date", in: "query", required: false, description: "Date to compute slot isBooked for (e.g. '08 Mar, Sun'). Defaults to first available date.", schema: { type: "string", example: "08 Mar, Sun" } },
        ],
        responses: {
          200: {
            description: "Station retrieved successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Station retrieved successfully." },
                    data: {
                      type: "object",
                      properties: {
                        _id: { type: "string" },
                        name: { type: "string" },
                        address: { type: "string" },
                        latitude: { type: "number" },
                        longitude: { type: "number" },
                        status: { type: "string", enum: ["Available", "Unavailable", "Busy"] },
                        pricePerHour: { type: "string" },
                        pricePerHourValue: { type: "number" },
                        taxPercent: { type: "number" },
                        about: { type: "string" },
                        amenities: { type: "array", items: { type: "object", properties: { label: { type: "string" }, icon: { type: "string" } } } },
                        availableDates: {
                          type: "array",
                          description: "Auto-generated next 7 days if not manually set",
                          items: { type: "string", example: "08 Mar, Sun" },
                        },
                        selectedDate: { type: "string", example: "08 Mar, Sun", description: "Date used for slot isBooked computation" },
                        slots: {
                          type: "array",
                          description: "Slots with isBooked computed from actual bookings for selectedDate",
                          items: {
                            type: "object",
                            properties: {
                              startTime: { type: "string", example: "08:00 AM" },
                              endTime:   { type: "string", example: "08:30 AM" },
                              isBooked:  { type: "boolean", example: false },
                            },
                          },
                        },
                        bookingCountsByDate: {
                          type: "array",
                          description: "Booking count per date for admin overview",
                          items: {
                            type: "object",
                            properties: {
                              date:  { type: "string", example: "08 Mar, Sun" },
                              count: { type: "number", example: 3 },
                            },
                          },
                        },
                        qrToken: { type: "string" },
                        qrCode:  { type: "string", description: "Base64 QR image data-URL" },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Station not found" },
          401: { description: "Unauthorised" },
        },
      },
      put: {
        tags: ["Admin Stations"],
        summary: "Update a charging station",
        description: "If address is updated, lat/long will be auto-fetched. If `startHour`/`endHour`/`intervalMin` are provided, slots will be regenerated (replaces all existing slots).",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Updated Station Name" },
                  address: { type: "string", example: "Gulshan 2, Dhaka, Bangladesh" },
                  status: { type: "string", enum: ["Available", "Unavailable", "Busy"] },
                  pricePerHour: { type: "string", example: "$15/hr" },
                  pricePerHourValue: { type: "number", example: 15 },
                  startHour: { type: "number", example: 8, description: "Slot start hour (24h). Provide to regenerate slots." },
                  endHour: { type: "number", example: 18, description: "Slot end hour (24h). Provide to regenerate slots." },
                  intervalMin: { type: "number", example: 30, description: "Slot interval in minutes. Provide to regenerate slots." },
                  amenities: {
                    type: "array",
                    description: "Update amenities list. Options: Restaurant, Wi-Fi, Maintenance, Shop, Restroom, Parking, Lounge, Coffee",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", example: "Wi-Fi" },
                        icon: { type: "string", example: "wifi" },
                      },
                    },
                    example: [{ label: "Restaurant", icon: "restaurant" }, { label: "Wi-Fi", icon: "wifi" }],
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Station updated (lat/long auto-updated if address changed, slots regenerated if slot config provided)" },
          400: { description: "Station not found" },
          401: { description: "Unauthorised" },
        },
      },
      delete: {
        tags: ["Admin Stations"],
        summary: "Delete a charging station",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Station deleted" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── Admin: Get predefined amenities list ───────────────────────────
    "/api/v1/admin/stations/amenities": {
      get: {
        tags: ["Admin Stations"],
        summary: "Get list of available amenity options",
        description: "Returns a predefined list of amenities (Restaurant, Wi-Fi, Maintenance, Shop, Restroom, Parking, Lounge, Coffee) with Material icon names. Admin frontend can display these as checkboxes when creating/updating a station.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "Amenity options list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Available amenity options." },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string", example: "Restaurant" },
                          icon: { type: "string", example: "restaurant" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── Admin: Generate Slots for a Station ──────────────────────────────
    "/api/v1/admin/stations/{id}/slots": {
      post: {
        tags: ["Admin Stations"],
        summary: "Auto-generate time slots for a station",
        description: "Generates 30-min (default) time slots between startHour and endHour. Replaces all existing slots. Default: 8 AM to 6 PM = 20 slots.",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, description: "Station ID", schema: { type: "string" } }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  startHour:   { type: "integer", example: 8,  description: "Start hour (24h format, default 8 = 8 AM)" },
                  endHour:     { type: "integer", example: 18, description: "End hour (24h format, default 18 = 6 PM)" },
                  intervalMin: { type: "integer", example: 30, description: "Slot interval in minutes (default 30)" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Slots generated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "20 slot(s) generated for \"Charge Point Station\"." },
                    data: {
                      type: "object",
                      properties: {
                        stationId: { type: "string" },
                        slotsCount: { type: "integer", example: 20 },
                        slots: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              startTime: { type: "string", example: "10:00 AM" },
                              endTime:   { type: "string", example: "10:30 AM" },
                              isBooked:  { type: "boolean", example: false },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Station not found or invalid params" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Users
    // ─────────────────────────────────────────
    "/api/v1/admin/users": {
      get: {
        tags: ["Admin Users"],
        summary: "Get all users",
        description: "Returns all registered users (password/otp fields excluded).",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "List of users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: { type: "array", items: { type: "object", properties: { _id: { type: "string" }, fullName: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, isVerified: { type: "boolean" } } } },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },
    "/api/v1/admin/users/{id}": {
      delete: {
        tags: ["Admin Users"],
        summary: "Delete a user",
        security: [{ BearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "User deleted" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Bookings
    // ─────────────────────────────────────────
    "/api/v1/admin/bookings": {
      get: {
        tags: ["Admin Bookings"],
        summary: "Get all bookings",
        description: "Returns all bookings with user info populated.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "List of bookings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─────────────────────────────────────────
    // Admin Reviews
    // ─────────────────────────────────────────
    "/api/v1/admin/reviews": {
      get: {
        tags: ["Admin Reviews"],
        summary: "Get all reviews",
        description: "Returns all reviews with user info populated.",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "List of reviews",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ════════════════════════════════════════════════════════════
    // APP SETTINGS (Admin + Public)
    // ════════════════════════════════════════════════════════════

    // ─── GET /admin/settings ─────────────────────────────────────────
    "/api/v1/admin/settings": {
      get: {
        tags: ["Admin Settings"],
        summary: "Get app settings",
        description: "Returns full app settings including payment gateway credentials (secrets masked), currency config, and gateway ON/OFF toggles. **Admin only.**",
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: "App settings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "App settings retrieved." },
                    data: {
                      type: "object",
                      properties: {
                        stripeEnabled:        { type: "boolean", example: true },
                        sslcommerzEnabled:    { type: "boolean", example: true },
                        savedCardEnabled:     { type: "boolean", example: true },
                        stripePublishableKey: { type: "string", example: "pk_test_51SwH2S..." },
                        stripeSecretKey:      { type: "string", example: "sk_test_...wxyz", description: "Masked for security" },
                        stripeWebhookSecret:  { type: "string", example: "whsec_1...abcd", description: "Masked for security" },
                        sslStoreId:           { type: "string", example: "sazza694eb99831101" },
                        sslStorePassword:     { type: "string", example: "sazza694...@ssl", description: "Masked for security" },
                        sslIsLive:            { type: "boolean", example: false },
                        currencyCode:         { type: "string", example: "BDT" },
                        currencySymbol:       { type: "string", example: "৳" },
                        currencyIcon:         { type: "string", example: "currency_taka", description: "Material icon name for Flutter" },
                        sslMinAmount:         { type: "number", example: 10 },
                        stripeMinAmount:      { type: "number", example: 100 },
                        updatedAt:            { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Unauthorised" },
        },
      },

      // ─── PUT /admin/settings ────────────────────────────────────────
      put: {
        tags: ["Admin Settings"],
        summary: "Update app settings",
        description: "Update any/all settings. Only provided fields are updated; omitted fields stay unchanged. **Immediately clears payment service cache** so new keys take effect.\n\n**Available fields:** stripeEnabled, sslcommerzEnabled, savedCardEnabled, stripePublishableKey, stripeSecretKey, stripeWebhookSecret, sslStoreId, sslStorePassword, sslIsLive, currencyCode, currencySymbol, currencyIcon, sslMinAmount, stripeMinAmount",
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  stripeEnabled:        { type: "boolean", example: true, description: "Enable/disable Stripe gateway" },
                  sslcommerzEnabled:    { type: "boolean", example: true, description: "Enable/disable SSLCommerz gateway" },
                  savedCardEnabled:     { type: "boolean", example: true, description: "Enable/disable Saved Card payment" },
                  stripePublishableKey: { type: "string", example: "pk_test_51SwH2S0BRjy0fFY4..." },
                  stripeSecretKey:      { type: "string", example: "sk_test_51SwH2S0BRjy0fFY4..." },
                  stripeWebhookSecret:  { type: "string", example: "whsec_1abc..." },
                  sslStoreId:           { type: "string", example: "sazza694eb99831101" },
                  sslStorePassword:     { type: "string", example: "sazza694eb99831101@ssl" },
                  sslIsLive:            { type: "boolean", example: false, description: "false = sandbox, true = production" },
                  currencyCode:         { type: "string", example: "BDT", description: "ISO 4217 currency code" },
                  currencySymbol:       { type: "string", example: "৳", description: "Currency symbol shown in app" },
                  currencyIcon:         { type: "string", example: "currency_taka", description: "Material icon name for Flutter" },
                  sslMinAmount:         { type: "number", example: 10, description: "Min amount for SSLCommerz" },
                  stripeMinAmount:      { type: "number", example: 100, description: "Min amount for Stripe" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Settings updated",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "Settings updated successfully." },
                    data: { type: "object", description: "Updated settings (same shape as GET)" },
                  },
                },
              },
            },
          },
          400: { description: "No valid fields provided" },
          401: { description: "Unauthorised" },
        },
      },
    },

    // ─── GET /app/settings (Public — no auth) ────────────────────────
    "/api/v1/app/settings": {
      get: {
        tags: ["App Settings (Public)"],
        summary: "Get public app settings",
        description: "Returns safe app settings for Flutter to consume at startup. Includes: enabled gateways, Stripe publishable key (NOT secret), SSLCommerz client credentials, currency info, available gateways list. **No authentication required.**",
        responses: {
          200: {
            description: "Public app settings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    message: { type: "string", example: "App settings retrieved." },
                    data: {
                      type: "object",
                      properties: {
                        stripeEnabled:        { type: "boolean", example: true },
                        sslcommerzEnabled:    { type: "boolean", example: true },
                        savedCardEnabled:     { type: "boolean", example: true },
                        stripePublishableKey: { type: "string", example: "pk_test_51SwH2S0BRjy0fFY4..." },
                        sslStoreId:           { type: "string", example: "sazza694eb99831101" },
                        sslStorePassword:     { type: "string", example: "sazza694eb99831101@ssl" },
                        sslIsLive:            { type: "boolean", example: false },
                        currencyCode:         { type: "string", example: "BDT" },
                        currencySymbol:       { type: "string", example: "৳" },
                        currencyIcon:         { type: "string", example: "currency_taka" },
                        availableGateways: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id:          { type: "string", example: "sslcommerz" },
                              name:        { type: "string", example: "SSLCommerz" },
                              description: { type: "string", example: "Pay via bKash, Nagad, Cards, Mobile Banking" },
                              minAmount:   { type: "number", example: 10 },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════
    // PAYMENT CALLBACKS & STATUS POLLING
    // ════════════════════════════════════════════════════════════

    // ─── SSLCommerz Success Callback ─────────────────────────────────
    "/payment/sslcommerz/success": {
      post: {
        tags: ["Payment"],
        summary: "[Callback] SSLCommerz payment success",
        description: "Called by SSLCommerz after successful payment. Marks booking/session as paid. Returns an HTML success page. **Do not call from Flutter — this is a server-to-server callback.**",
        requestBody: {
          content: { "application/x-www-form-urlencoded": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "HTML success page" },
        },
      },
    },

    // ─── SSLCommerz Fail Callback ────────────────────────────────────
    "/payment/sslcommerz/fail": {
      post: {
        tags: ["Payment"],
        summary: "[Callback] SSLCommerz payment failed",
        description: "Called by SSLCommerz when payment fails. Updates paymentStatus to 'failed'. Returns an HTML failure page.",
        requestBody: {
          content: { "application/x-www-form-urlencoded": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "HTML failure page" },
        },
      },
    },

    // ─── SSLCommerz Cancel Callback ──────────────────────────────────
    "/payment/sslcommerz/cancel": {
      post: {
        tags: ["Payment"],
        summary: "[Callback] SSLCommerz payment cancelled",
        description: "Called by SSLCommerz when user cancels. Updates paymentStatus to 'cancelled'. Returns an HTML cancel page.",
        requestBody: {
          content: { "application/x-www-form-urlencoded": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "HTML cancel page" },
        },
      },
    },

    // ─── SSLCommerz IPN ──────────────────────────────────────────────
    "/payment/sslcommerz/ipn": {
      post: {
        tags: ["Payment"],
        summary: "[Callback] SSLCommerz Instant Payment Notification",
        description: "Server-to-server IPN from SSLCommerz. Validates and updates payment status. **Do not call from Flutter.**",
        requestBody: {
          content: { "application/x-www-form-urlencoded": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "IPN acknowledged" },
        },
      },
    },

    // ─── Stripe Webhook ──────────────────────────────────────────────
    "/payment/stripe/webhook": {
      post: {
        tags: ["Payment"],
        summary: "[Webhook] Stripe payment events",
        description: "Receives Stripe webhook events (e.g. `payment_intent.succeeded`). Verifies signature and updates booking/session. **Do not call from Flutter — configure in Stripe Dashboard.**",
        requestBody: {
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          200: { description: "Webhook acknowledged" },
        },
      },
    },

    // ─── GET /payment/status/booking/:id  (Flutter Polling) ─────────
    "/payment/status/booking/{id}": {
      get: {
        tags: ["Payment"],
        summary: "Poll booking payment status",
        description: "Flutter polls this endpoint after SSLCommerz WebView redirect to check if payment was completed. No auth required.",
        parameters: [
          { name: "id", in: "path", required: true, description: "Booking ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Current payment status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        bookingId:      { type: "string" },
                        isPaid:         { type: "boolean", example: true },
                        paymentStatus:  { type: "string", example: "paid", description: "pending | paid | failed | cancelled" },
                        paymentGateway: { type: "string", example: "sslcommerz" },
                        transactionId:  { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: "Booking not found" },
        },
      },
    },

    // ─── GET /payment/status/session/:id  (Flutter Polling) ─────────
    "/payment/status/session/{id}": {
      get: {
        tags: ["Payment"],
        summary: "Poll session extension payment status",
        description: "Flutter polls this endpoint after SSLCommerz WebView redirect to check if extension payment was completed. No auth required.",
        parameters: [
          { name: "id", in: "path", required: true, description: "Session ID", schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Current extension payment status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "Success" },
                    data: {
                      type: "object",
                      properties: {
                        sessionId:              { type: "string" },
                        sessionStatus:          { type: "string", example: "Completed" },
                        extensionPaymentStatus: { type: "string", example: "paid", description: "pending | paid | failed | cancelled" },
                        paymentGateway:         { type: "string", example: "sslcommerz" },
                        transactionId:          { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: "Session not found" },
        },
      },
    },
  },
};

const swaggerSpec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: [],
});

export const setupSwagger = (app) => {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: "UV Charging API Docs",
  }));
};
