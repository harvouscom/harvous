import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId, getToken } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { newEmail, currentPassword, newPassword } = body;

    // Validate that at least one field is provided
    if (!newEmail && !newPassword) {
      return new Response(JSON.stringify({ error: 'At least one field must be provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate password requirements
    if (newPassword && newPassword.length < 8) {
      return new Response(JSON.stringify({ error: 'Password must be at least 8 characters' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get Clerk secret key
    const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
    
    if (!clerkSecretKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update user credentials in Clerk
    const updateData: any = {};
    
    if (newEmail) {
      // For email updates, we need to create a new email address
      // This will send a verification email to the new address
      updateData.email_address = newEmail;
    }
    
    if (newPassword) {
      // For password updates, we need the current password
      if (!currentPassword) {
        return new Response(JSON.stringify({ error: 'Current password is required to change password' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      updateData.password = newPassword;
    }

    // Make API call to Clerk
    const clerkResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${clerkSecretKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updateData)
    });

    if (!clerkResponse.ok) {
      const errorText = await clerkResponse.text();
      console.error('Clerk API error:', errorText);
      
      // Parse error response to provide better error messages
      let errorMessage = 'Failed to update credentials';
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errors && errorData.errors.length > 0) {
          const firstError = errorData.errors[0];
          if (firstError.code === 'form_password_incorrect') {
            errorMessage = 'Current password is incorrect';
          } else if (firstError.code === 'form_password_pwned') {
            errorMessage = 'This password has been found in a data breach. Please choose a different password';
          } else if (firstError.code === 'form_password_too_common') {
            errorMessage = 'This password is too common. Please choose a different password';
          } else if (firstError.code === 'form_email_address_invalid') {
            errorMessage = 'Please enter a valid email address';
          } else if (firstError.code === 'form_email_address_already_exists') {
            errorMessage = 'This email address is already in use';
          } else {
            errorMessage = firstError.longMessage || errorMessage;
          }
        }
      } catch (parseError) {
        console.error('Error parsing Clerk error response:', parseError);
      }
      
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log('Credentials updated successfully in Clerk');

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Credentials updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating credentials:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
