import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const defaultThemes = {
    modern: {
        name: 'Modern Soft',
        cardRadius: '12px',
        cardBorderWidth: '1px',
        cardBorderColor: '#e2e8f0',
        cardShadowX: '0px',
        cardShadowY: '10px',
        cardShadowBlur: '25px',
        cardShadowSpread: '-5px',
        cardShadowColor: 'rgba(0,0,0,0.1)',

        btnRadius: '6px',
        btnBorderWidth: '1px',
        btnBorderColor: '#e2e8f0',
        btnShadowX: '0px',
        btnShadowY: '2px',
        btnShadowBlur: '5px',
        btnShadowSpread: '0px',
        btnShadowColor: 'rgba(0,0,0,0.05)',

        bgColor: '#f8fafc',
        bgColorAlt: '#ffffff',
        mainColor: '#3b82f6',
        inputFocus: '#2563eb',
        fontColor: '#1e293b',
        fontColorSub: '#64748b',

        fontFamily: "'Inter', sans-serif",
        lineType: 'curve', // curve, elbow, straight
        lineColor: '#94a3b8',
        picRadius: '50%',
        picBorderWidth: '2px',
        picBorderColor: '#e2e8f0',
    },
    brutalist: {
        name: 'Neo Brutalist',
        cardRadius: '4px',
        cardBorderWidth: '3px',
        cardBorderColor: '#000000',
        cardShadowX: '6px',
        cardShadowY: '6px',
        cardShadowBlur: '0px',
        cardShadowSpread: '0px',
        cardShadowColor: '#000000',

        btnRadius: '4px',
        btnBorderWidth: '3px',
        btnBorderColor: '#000000',
        btnShadowX: '4px',
        btnShadowY: '4px',
        btnShadowBlur: '0px',
        btnShadowSpread: '0px',
        btnShadowColor: '#000000',

        bgColor: '#ffffff',
        bgColorAlt: '#f1f1f1',
        mainColor: '#000000',
        inputFocus: '#ff3e00',
        fontColor: '#000000',
        fontColorSub: '#444444',

        fontFamily: "'Space Mono', monospace",
        lineType: 'elbow',
        lineColor: '#000000',
        picRadius: '0px',
        picBorderWidth: '3px',
        picBorderColor: '#000000',
    }
};

export const useThemeStore = create(
    persist(
        (set) => ({
            theme: defaultThemes.modern, // Start with modern
            customThemes: [],

            // Actions
            applyPreset: (presetId) => set((state) => {
                const defaultT = defaultThemes[presetId];
                if (defaultT) return { theme: defaultT };
                const customT = state.customThemes.find(t => t.id === presetId);
                // Return a copy so editing doesn't mutate the saved theme
                if (customT) return { theme: { ...customT } };
                return state;
            }),

            saveCustomTheme: (name) => set((state) => ({
                customThemes: [...state.customThemes, { ...state.theme, name, id: 't_' + Date.now() }]
            })),

            deleteCustomTheme: (id) => set((state) => ({
                customThemes: state.customThemes.filter(t => t.id !== id)
            })),

            updateTheme: (updates) => set((state) => ({
                theme: { ...state.theme, ...updates }
            })),

            resetTheme: () => set({ theme: defaultThemes.modern }),
        }),
        {
            name: 'orgchart-theme-storage', // Saves to localStorage
        }
    )
);
