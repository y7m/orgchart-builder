import { useEffect } from 'react';
import { useThemeStore } from './store/useThemeStore';
import { useOrgStore } from './store/useOrgStore';
import EditorSidebar from './components/EditorSidebar';
import Canvas from './components/Canvas';
import TopBar from './components/TopBar';
import { EmployeeModal, DivisionModal, VerticalModal } from './components/Modals';
import ExportModal from './components/ExportModal';
import * as htmlToImage from 'html-to-image';
import { useState } from 'react';

function App() {
  const { theme } = useThemeStore();
  const { activeModal, closeModal } = useOrgStore();

  // Dynamically update CSS custom properties whenever the theme store changes
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-color', theme.bgColor);
    root.style.setProperty('--bg-color-alt', theme.bgColorAlt);
    root.style.setProperty('--main-color', theme.mainColor);
    root.style.setProperty('--input-focus', theme.inputFocus);
    root.style.setProperty('--font-color', theme.fontColor);
    root.style.setProperty('--font-color-sub', theme.fontColorSub);
    root.style.setProperty('--font-family', theme.fontFamily);

    root.style.setProperty('--card-radius', theme.cardRadius);
    root.style.setProperty('--card-border-width', theme.cardBorderWidth);
    root.style.setProperty('--card-border-color', theme.cardBorderColor);
    root.style.setProperty('--card-shadow-x', theme.cardShadowX);
    root.style.setProperty('--card-shadow-y', theme.cardShadowY);
    root.style.setProperty('--card-shadow-blur', theme.cardShadowBlur);
    root.style.setProperty('--card-shadow-spread', theme.cardShadowSpread);
    root.style.setProperty('--card-shadow-color', theme.cardShadowColor);

    root.style.setProperty('--btn-radius', theme.btnRadius);
    root.style.setProperty('--btn-border-width', theme.btnBorderWidth);
    root.style.setProperty('--btn-border-color', theme.btnBorderColor);
    root.style.setProperty('--btn-shadow-x', theme.btnShadowX);
    root.style.setProperty('--btn-shadow-y', theme.btnShadowY);
    root.style.setProperty('--btn-shadow-blur', theme.btnShadowBlur);
    root.style.setProperty('--btn-shadow-spread', theme.btnShadowSpread);
    root.style.setProperty('--btn-shadow-color', theme.btnShadowColor);

    root.style.setProperty('--line-color', theme.lineColor);
    root.style.setProperty('--pic-radius', theme.picRadius);
    root.style.setProperty('--pic-border-width', theme.picBorderWidth);
    root.style.setProperty('--pic-border-color', theme.picBorderColor);

    root.style.setProperty('--card-bg-color', theme.cardBgColor);
    root.style.setProperty('--name-font-size', theme.nameFontSize);
    root.style.setProperty('--title-font-size', theme.titleFontSize);
    root.style.setProperty('--div-font-size', theme.divFontSize);
    root.style.setProperty('--sub-font-size', theme.subFontSize);
  }, [theme]);

  // Dynamically load Google Font
  useEffect(() => {
    const fontName = theme.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    if (fontName) {
      const linkId = 'dynamic-google-font';
      let linkEl = document.getElementById(linkId);
      if (!linkEl) {
        linkEl = document.createElement('link');
        linkEl.id = linkId;
        linkEl.rel = 'stylesheet';
        document.head.appendChild(linkEl);
      }
      linkEl.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;600;800&display=swap`;
    }
  }, [theme.fontFamily]);

  // Bind Export Logic globally so the TopBar can trigger it easily
  useEffect(() => {
    window.exportChart = async (transparent = false) => {
      document.body.classList.add('exporting');
      if (transparent) document.body.classList.add('exporting-transparent');

      // Wait for React to apply css (hiding the UI elements)
      await new Promise(r => setTimeout(r, 100));

      const target = document.getElementById('canvas-container');
      if (!target) return;

      try {
        const svgElement = target.querySelector('svg');
        let bbox = { x: 0, y: 0, width: 600, height: 600 };

        // Grab D3 Line bounds to frame the whole tree accurately
        if (svgElement && svgElement.getBBox) {
          const actualBbox = svgElement.getBBox();
          if (actualBbox.width > 0 && actualBbox.height > 0) {
            bbox = actualBbox;
          }
        }

        // Add 800px padding around the SVG lines to account for the HTML OrgCards overhang
        const paddedWidth = bbox.width + 1600;
        const paddedHeight = bbox.height + 1600;
        const offsetX = -bbox.x + 800;
        const offsetY = -bbox.y + 400;

        const dataUrl = await htmlToImage.toPng(target.querySelector('div'), {
          backgroundColor: transparent ? 'rgba(0,0,0,0)' : theme.bgColor,
          pixelRatio: 2,
          width: paddedWidth,
          height: paddedHeight,
          style: {
            transform: `scale(1) translate(${offsetX}px, ${offsetY}px)`,
            position: 'absolute',
            left: '0',
            top: '0'
          }
        });

        // Convert Data URI to Blob to prevent Browser Href limit crashing
        const response = await fetch(dataUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.download = transparent ? 'OrgChart_Clear.png' : 'OrgChart_Solid.png';
        link.href = url;
        link.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

      } catch (err) {
        console.error("Export failed", err);
        alert("Failed to export image.");
      } finally {
        document.body.classList.remove('exporting');
        document.body.classList.remove('exporting-transparent');
      }
    };
  }, [theme.bgColor]);

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <TopBar />

      {activeModal === 'employee' && <EmployeeModal onClose={closeModal} />}
      {activeModal === 'division' && <DivisionModal onClose={closeModal} />}
      {activeModal === 'vertical' && <VerticalModal onClose={closeModal} />}
      {activeModal === 'export' && <ExportModal onClose={closeModal} />}

      <Canvas />
      <EditorSidebar />
    </div>
  );
}

export default App;
