import React, { useState, useEffect } from 'react';

const HORSE = `
                      ,,  //
                     d  b//
                    / \\ //
                   /|  |/
              ____/ |  |
             /      /  \\  hjw
            /      / /\\ \\
           /    __/ /  \\ \\
          /   /   \\/    \\_\\
         /   / \\          \\
        /   /   \\    _     |
       /   /     \\  / \\   /
       \\  /       \\/   \\ /
        \\/              '
         \\     .  .    /
          \\   ______  /
           \\_/      \\_/
`;

export default function AsciiHorse() {
  const [visible, setVisible] = useState(false);
  const [glitch, setGlitch] = useState(false);

  useEffect(() => {
    // Fade in
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);

  // Occasional glitch
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() < 0.15) {
        setGlitch(true);
        setTimeout(() => setGlitch(false), 80 + Math.random() * 120);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const style = {
    opacity: visible ? 1 : 0,
    transition: 'opacity 2s ease-in',
    fontFamily: '"Space Mono", monospace',
    fontSize: '11px',
    lineHeight: '1.1',
    color: glitch ? '#ff2828' : '#666',
    whiteSpace: 'pre',
    textAlign: 'center',
    transform: glitch ? `translate(${Math.random() * 4 - 2}px, ${Math.random() * 2 - 1}px)` : 'none',
    filter: glitch ? 'blur(0.5px)' : 'none',
  };

  return <pre style={style}>{HORSE}</pre>;
}
