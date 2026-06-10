type Props = {
  width?: number;
  height?: number;
  children: React.ReactNode;
  glow?: boolean;
};

export function PhoneFrame({ width = 660, height = 1340, children, glow = true }: Props) {
  const bezel = 18;
  const radius = 78;
  return (
    <div
      style={{
        width, height, borderRadius: radius, padding: bezel,
        background: 'linear-gradient(160deg, #14201a, #0a140f)',
        boxShadow: glow
          ? '0 2px 0 rgba(227,201,135,0.25) inset, 0 50px 90px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(227,201,135,0.18)'
          : 'none',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: '100%', height: '100%', borderRadius: radius - bezel,
          background: '#fcf9f2', overflow: 'hidden', position: 'relative',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {children}
        <div
          style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            width: 132, height: 36, borderRadius: 999, background: '#0a140f', zIndex: 30,
          }}
        />
      </div>
    </div>
  );
}

type MockProps = {
  Screen: React.ComponentType;
  scale?: number;
};

export function PhoneMock({ Screen, scale = 0.42 }: MockProps) {
  // Le scale est posé en CSS variable pour qu'un média-query puisse le surcharger
  // (ex. réduire la taille du téléphone sur tablette/mobile sans relayer un prop).
  return (
    <div className="phone-mock" style={{ ['--phone-scale' as string]: String(scale) }}>
      <div className="phone-mock-inner">
        <PhoneFrame width={660} height={1340}>
          <Screen />
        </PhoneFrame>
      </div>
    </div>
  );
}
