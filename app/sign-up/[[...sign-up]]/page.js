import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#fafaff',
      fontFamily: 'DM Sans, sans-serif',
      padding: '0 20px',
    }}>
      <a href="/" style={{
        fontFamily: 'Manrope, sans-serif',
        fontWeight: 800,
        fontSize: 22,
        letterSpacing: '-0.07em',
        color: '#11131d',
        textDecoration: 'none',
        marginBottom: 32,
      }}>
        cernly<span style={{ fontWeight: 600 }}>.ai</span>
      </a>
      <SignUp
        appearance={{
          variables: {
            colorPrimary: '#7548f8',
            colorBackground: '#ffffff',
            colorText: '#11131d',
            colorTextSecondary: '#6f7280',
            colorInputBackground: '#fafaff',
            colorInputText: '#11131d',
            borderRadius: '12px',
            fontFamily: 'DM Sans, sans-serif',
          },
        }}
      />
    </div>
  );
}
