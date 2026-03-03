import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useOrgStore } from '../store/useOrgStore';
import { useThemeStore } from '../store/useThemeStore';
import * as d3 from 'd3';
import OrgCard from './OrgCard';
import LineConnector from './LineConnector';

const Canvas = () => {
    const { employees, collapsedNodes } = useOrgStore();
    const { theme } = useThemeStore();

    const svgRef = useRef(null);
    const containerRef = useRef(null);

    // Pan and Zoom State (handled by D3 Zoom on the SVG)
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

    // 1. Convert flat array into D3 Stratified Hierarchy
    const hierarchyData = useMemo(() => {
        try {
            const root = d3.stratify()
                .id(d => d.id)
                .parentId(d => d.managerId)(employees);

            // Prune collapsed nodes
            root.each(node => {
                if (collapsedNodes.includes(node.id) && node.children) {
                    node._children = node.children;
                    node.children = null;
                }
            });
            return root;
        } catch (e) {
            console.error("Tree structure error (cycles or missing parents):", e);
            return null;
        }
    }, [employees, collapsedNodes]);

    // 2. Calculate Layout Coordinates via D3 Tree
    // We specify large enough node sizes to accommodate HTML cards with plenty of padding
    const layout = useMemo(() => {
        if (!hierarchyData) return { nodes: [], links: [] };

        // We adjust width based on Brutalist vs Modern presets spacing preferences,
        // but 320x350 is a safe default block size.
        const treeLayout = d3.tree().nodeSize([320, 350]);
        const rootNode = treeLayout(hierarchyData);

        return {
            nodes: rootNode.descendants(), // Array of nodes with x,y
            links: rootNode.links()        // Array of source/target pairs
        };
    }, [hierarchyData]);

    // 3. Attach D3 Zoom Behavior to the Container
    useEffect(() => {
        if (!containerRef.current) return;

        const zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .filter(event => event.button === 1 || event.type === 'wheel') // Only respond to Middle Mouse and Scroll
            .on('zoom', (event) => {
                setTransform(event.transform);
            });

        d3.select(containerRef.current).call(zoom);

        // Initial centering of the tree
        d3.select(containerRef.current).call(
            zoom.transform,
            d3.zoomIdentity.translate(window.innerWidth / 2 - 160, 100)
        );
    }, []);

    return (
        <div
            ref={containerRef}
            id="canvas-container"
            style={{
                flex: 1,
                backgroundColor: 'var(--bg-color)',
                position: 'relative',
                overflow: 'hidden',
                cursor: 'grab'
            }}
        >
            {/* 
        This div is moved/scaled by Zoom. 
        It contains BOTH the SVG Lines AND the Absolute HTML Cards.
      */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%', height: '100%',
                transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
                transformOrigin: '0 0'
            }}>

                {/* Layer 1: Connecting Lines (SVG) */}
                <svg
                    ref={svgRef}
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
                >
                    {layout.links.map((link) => (
                        <LineConnector
                            key={`link-${link.source.id}-${link.target.id}`}
                            source={link.source}
                            target={link.target}
                            themeType={theme.lineType}
                            mainColor={theme.mainColor}
                        />
                    ))}
                </svg>

                {/* Layer 2: Employee Cards (HTML) */}
                {layout.nodes.map(node => (
                    <OrgCard
                        key={node.id}
                        node={node}
                        x={node.x - 140}
                        y={node.y}
                        scale={transform.k}
                    />
                ))}

            </div>
        </div>
    );
};

export default Canvas;
