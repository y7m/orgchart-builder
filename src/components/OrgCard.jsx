import React, { useState } from 'react';
import { useThemeStore } from '../store/useThemeStore';
import { useOrgStore } from '../store/useOrgStore';
import { Pencil } from 'lucide-react';

const OrgCard = ({ node, x, y, scale = 1 }) => {
    const { theme } = useThemeStore();
    const { employees, verticals, divisions, updateEmployeeManager, toggleCollapseNode, collapsedNodes, openModal } = useOrgStore();

    const emp = node.data;
    const division = divisions.find(d => d.id === emp.divisionId);

    // Custom HTML-based Drag & Drop state
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const [isHovered, setIsHovered] = useState(false);

    const hasChildren = !!(node.children || node._children);
    const isCollapsed = collapsedNodes.includes(node.id);

    // Map subtopic IDs to real Vertical objects to grab their colored bullets
    const renderedSubtopics = emp.subtopics?.map(subId => {
        let parentVert = null;
        let subText = '';

        verticals.forEach(v => {
            const match = v.subtopics?.find(s => s.id === subId);
            if (match) {
                parentVert = v;
                subText = match.text;
            }
        });

        if (!parentVert) return null;

        return (
            <div key={subId} style={{ display: 'flex', alignItems: 'flex-start', fontSize: 'var(--sub-font-size, 11px)', color: 'var(--font-color)', lineHeight: 1.2, marginBottom: '4px' }}>
                <div style={{
                    width: '8px', height: '12px', borderRadius: '2px',
                    backgroundColor: parentVert.color, marginRight: '6px', flexShrink: 0,
                    border: '1px solid var(--card-border-color)'
                }} />
                <div>{subText}</div>
            </div>
        );
    }).filter(Boolean);

    const handlePointerDown = (e) => {
        // Prevent drag on buttons
        if (e.target.closest('button') || e.target.closest('svg')) return;

        e.target.setPointerCapture(e.pointerId);
        setIsDragging(true);
        setDragOffset({ x: e.clientX, y: e.clientY });
        setDragPos({ x, y });
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        // Divide by zoom scale to match SVG/Canvas coordinate space
        const dx = (e.clientX - dragOffset.x) / scale;
        const dy = (e.clientY - dragOffset.y) / scale;

        setDragPos({
            x: x + dx,
            y: y + dy
        });
    };

    const handlePointerUp = (e) => {
        if (!isDragging) return;
        e.target.releasePointerCapture(e.pointerId);
        setIsDragging(false);

        // Hide self temporarily so elementFromPoint hits what's underneath
        const cardEl = e.target.closest('.org-card-container');
        if (cardEl) {
            const oldDisplay = cardEl.style.display;
            cardEl.style.display = 'none';

            // DOM Hit test
            const els = document.elementsFromPoint(e.clientX, e.clientY);
            const dropCard = els.find(el => el.classList.contains('org-card-dropzone'));

            if (dropCard) {
                const targetId = dropCard.getAttribute('data-empid');
                if (targetId && targetId !== node.id) {
                    updateEmployeeManager(node.id, targetId);
                }
            }

            cardEl.style.display = oldDisplay;
        }
    };

    return (
        <div
            className="org-card-container org-card-dropzone"
            data-empid={node.id}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                position: 'absolute',
                top: isDragging ? dragPos.y : y,
                left: isDragging ? dragPos.x : x,
                width: '280px',
                backgroundColor: 'var(--card-bg-color, var(--bg-color-alt))',
                padding: '30px 15px 15px',
                borderRadius: 'var(--card-radius)',
                border: `var(--card-border-width) solid ${division ? division.color : 'var(--card-border-color)'}`,
                boxShadow: `var(--card-shadow-x) var(--card-shadow-y) var(--card-shadow-blur) var(--card-shadow-spread) var(--card-shadow-color)`,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isDragging ? 999 : 1,
                transition: isDragging ? 'none' : 'all 0.3s ease',
                userSelect: 'none',
                pointerEvents: 'auto'
            }}
        >
            <div style={{
                position: 'absolute', top: '-25px', left: 'calc(50% - 25px)',
                width: '50px', height: '50px', borderRadius: 'var(--pic-radius)',
                backgroundColor: 'var(--bg-color)', border: `var(--pic-border-width) solid var(--pic-border-color)`,
                display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden'
            }}>
                {emp.pic ? <img src={emp.pic} alt={emp.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> :
                    <svg viewBox="0 0 24 24" fill="var(--font-color-sub)" width="30" height="30"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
            </div>

            <div style={{ fontWeight: 800, fontSize: 'var(--name-font-size, 14px)', textAlign: 'center', marginBottom: '2px', color: 'var(--main-color)' }}>{emp.name}</div>
            <div style={{ fontWeight: 600, fontSize: 'var(--title-font-size, 11px)', textAlign: 'center', marginBottom: '12px', color: 'var(--font-color-sub)', textTransform: 'uppercase' }}>{emp.title}</div>

            {division && (
                <div style={{ fontSize: 'var(--div-font-size, 10px)', fontWeight: 800, color: division.color, textAlign: 'center', marginBottom: '10px', padding: '2px', borderBottom: `1px solid var(--card-border-color)` }}>
                    Division: {division.name}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {renderedSubtopics}
            </div>

            {hasChildren && isHovered && (
                <button
                    onClick={(e) => { e.stopPropagation(); toggleCollapseNode(node.id); }}
                    style={{ position: 'absolute', bottom: '-12px', left: 'calc(50% - 12px)', width: '24px', height: '24px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--card-border-color)', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', color: 'var(--font-color)' }}>
                    {isCollapsed ? '+' : '-'}
                </button>
            )}

            {isHovered && (
                <button
                    onClick={(e) => { e.stopPropagation(); openModal('employee', emp.id); }}
                    style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--font-color-sub)' }}>
                    <Pencil size={14} />
                </button>
            )}
        </div>
    );
};

export default OrgCard;
