import { useMemo, useState, useRef, useEffect } from 'react';
import { useOrgStore } from '../store/useOrgStore';
import { useThemeStore } from '../store/useThemeStore';
import * as d3 from 'd3';
import OrgCard from './OrgCard';
import LineConnector from './LineConnector';
import { buildTreeData, ROOT_ID, type TreeDatum } from '../domain/tree';
import { resetAllData } from '../store/reset';

export type OrgNode = d3.HierarchyPointNode<TreeDatum> & { _children?: d3.HierarchyNode<TreeDatum>[] };

type HierarchyResult = { root: d3.HierarchyNode<TreeDatum>; error: null } | { root: null; error: string };

const buildHierarchy = (employees: ReturnType<typeof useOrgStore.getState>['employees'], collapsed: string[]): HierarchyResult => {
    try {
        const { data } = buildTreeData(employees);
        if (data.length === 0) return { root: null, error: 'No employees yet.' };
        const root = d3.stratify<TreeDatum>()
            .id(d => d.id)
            .parentId(d => d.parentId)(data);

        const collapsedSet = new Set(collapsed);
        root.each(node => {
            const n = node as OrgNode;
            if (collapsedSet.has(n.id!) && n.children) {
                n._children = n.children;
                n.children = undefined;
            }
        });
        return { root, error: null };
    } catch (e) {
        console.error('Tree structure error (cycles or missing parents):', e);
        return { root: null, error: e instanceof Error ? e.message : String(e) };
    }
};

const Canvas = () => {
    const { employees, collapsedNodes, openModal } = useOrgStore();
    const { theme } = useThemeStore();

    const svgRef = useRef<SVGSVGElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Pan and Zoom State (handled by D3 Zoom on the container)
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

    // 1. Convert flat array into D3 Stratified Hierarchy
    const hierarchy = useMemo(() => buildHierarchy(employees, collapsedNodes), [employees, collapsedNodes]);

    // 2. Calculate Layout Coordinates via D3 Tree
    const layout = useMemo(() => {
        if (!hierarchy.root) return { nodes: [] as OrgNode[], links: [] as d3.HierarchyPointLink<TreeDatum>[] };
        const treeLayout = d3.tree<TreeDatum>().nodeSize([320, 350]);
        const rootNode = treeLayout(hierarchy.root);
        return {
            nodes: rootNode.descendants() as OrgNode[],
            links: rootNode.links(),
        };
    }, [hierarchy]);

    // 3. Attach D3 Zoom Behavior to the Container
    useEffect(() => {
        if (!containerRef.current) return;

        const zoom = d3.zoom<HTMLDivElement, unknown>()
            .scaleExtent([0.1, 3])
            .filter(event => event.button === 1 || event.type === 'wheel') // Only respond to Middle Mouse and Scroll
            .on('zoom', (event: d3.D3ZoomEvent<HTMLDivElement, unknown>) => {
                setTransform(event.transform);
            });

        const sel = d3.select(containerRef.current);
        sel.call(zoom);
        // Initial centering of the tree
        sel.call(zoom.transform, d3.zoomIdentity.translate(window.innerWidth / 2 - 160, 100));
    }, []);

    const showError = !hierarchy.root && employees.length > 0;

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
            {showError && (
                <div role="alert" className="hide-on-export" style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 60,
                    background: 'var(--bg-color-alt)', border: '1px solid #dc3545', borderRadius: 8, padding: 24, maxWidth: 420,
                    color: 'var(--font-color)', textAlign: 'center',
                }}>
                    <h3 style={{ marginTop: 0 }}>Unable to draw the chart</h3>
                    <p style={{ fontSize: 13, color: 'var(--font-color-sub)' }}>{hierarchy.error}</p>
                    <button onClick={() => { resetAllData(); }} style={{ padding: '8px 16px', color: '#dc3545', border: '1px solid #dc3545', borderRadius: 4, background: 'var(--bg-color)', cursor: 'pointer' }}>
                        Reset data
                    </button>
                </div>
            )}
            {!showError && employees.length === 0 && (
                <div className="hide-on-export" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: 'var(--font-color-sub)' }}>
                    <p>No employees yet.</p>
                    <button onClick={() => openModal('employee')} style={{ padding: '8px 16px', cursor: 'pointer' }}>+ Employee</button>
                </div>
            )}
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
                            mainColor={theme.lineColor || theme.mainColor}
                        />
                    ))}
                </svg>

                {/* Layer 2: Employee Cards (HTML) */}
                {layout.nodes.map(node => (
                    node.id === ROOT_ID ? (
                        <VirtualRootCard key={ROOT_ID} x={node.x - 140} y={node.y} />
                    ) : (
                        <OrgCard
                            key={node.id}
                            node={node}
                            x={node.x - 140}
                            y={node.y}
                            scale={transform.k}
                        />
                    )
                ))}

            </div>
        </div>
    );
};

/** Placeholder shown above multiple top-level people. Not a real employee. */
const VirtualRootCard = ({ x, y }: { x: number; y: number }) => (
    <div data-testid="virtual-root" style={{
        position: 'absolute', top: y + 40, left: x, width: '280px', padding: '15px',
        textAlign: 'center', fontWeight: 800, color: 'var(--font-color-sub)',
        border: '2px dashed var(--card-border-color)', borderRadius: 'var(--card-radius)',
        background: 'var(--bg-color-alt)',
    }}>
        Organization
        <div style={{ fontWeight: 400, fontSize: 11 }}>Multiple top-level people</div>
    </div>
);

export default Canvas;
