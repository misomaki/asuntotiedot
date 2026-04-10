import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Neliöt – Asuntohinnat kartalla'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #FFFBF5 0%, #fff0f8 50%, #fff8e0 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Logo grid */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', border: '3px solid #1a1a1a', background: '#ff90e8' }} />
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', border: '3px solid #1a1a1a', background: '#ffc900' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', border: '3px solid #1a1a1a', background: '#23c8a0' }} />
            <div style={{ width: '48px', height: '48px', borderRadius: '12px', border: '3px solid #1a1a1a', background: '#1a1a1a' }} />
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 900,
            color: '#1a1a1a',
            letterSpacing: '-1px',
            lineHeight: 1.1,
          }}
        >
          Neliöt
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '28px',
            color: '#666',
            marginTop: '16px',
            fontWeight: 500,
          }}
        >
          Asuntohinnat kartalla
        </div>

        {/* Stats line */}
        <div
          style={{
            display: 'flex',
            gap: '32px',
            marginTop: '40px',
            fontSize: '18px',
            color: '#999',
          }}
        >
          <span>266 000 rakennusta</span>
          <span>·</span>
          <span>7 kaupunkia</span>
          <span>·</span>
          <span>Avoin data</span>
        </div>

        {/* Domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            fontSize: '20px',
            color: '#999',
            fontWeight: 600,
          }}
        >
          neliohinnat.fi
        </div>
      </div>
    ),
    { ...size }
  )
}
