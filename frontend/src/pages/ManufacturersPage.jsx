import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getVendors, deleteVendor, getFields } from '../api/spoolman';
import AddVendorDialog from '../components/spoolman/AddVendorDialog';

export default function ManufacturersPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const [highlightedVendorId, setHighlightedVendorId] = useState(null);
    const highlightRef = useCallback((node) => {
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [highlightedVendorId]);
    useEffect(() => {
        const state = location.state;
        if (!state?.vendorId) return;
        navigate('/spoolman/manufacturers', { replace: true, state: null });
        setHighlightedVendorId(state.vendorId);
        setTimeout(() => setHighlightedVendorId(null), 3000);
    }, [location.state]);
    const [vendors, setVendors] = useState([]);
    const [extraFields, setExtraFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [editVendor, setEditVendor] = useState(null);

    const load = useCallback(async () => {
        try {
            const [v, fields] = await Promise.all([getVendors(), getFields('vendor')]);
            setVendors(v || []);
            setExtraFields(fields || []);
            setError(null);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleDelete(v) {
        if (!confirm(`Delete manufacturer "${v.name}"? This cannot be undone.`)) return;
        try {
            await deleteVendor(v.id);
            await load();
        } catch (e) {
            alert(e.message);
        }
    }

    const filtered = vendors.filter(v => {
        if (!search.trim()) return true;
        return (v.name || '').toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="page">
            <div className="sm-page-toolbar">
                <input
                    className="sm-input sm-page-search"
                    type="text"
                    placeholder="Search manufacturers…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <button className="btn btn-primary v-btn" onClick={() => setShowAdd(true)}>+ Add Manufacturer</button>
            </div>

            {loading ? (
                <div className="loading">Loading manufacturers…</div>
            ) : error ? (
                <div className="error">{error}</div>
            ) : filtered.length === 0 ? (
                <div className="text-muted" style={{ padding: '20px', textAlign: 'center' }}>
                    {search ? 'No manufacturers match your search' : 'No manufacturers in Spoolman'}
                </div>
            ) : (
                <div className="sm-catalogue-table-wrap">
                    <table className="sm-catalogue-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Comment</th>
                                {extraFields.map(f => (
                                    <th key={f.key}>{f.name}{f.unit ? ` (${f.unit})` : ''}</th>
                                ))}
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(v => {
                                const isHighlighted = v.id === highlightedVendorId;
                                return (
                                <tr key={v.id} ref={isHighlighted ? highlightRef : null} className="sm-catalogue-row" style={isHighlighted ? { background: 'color-mix(in srgb, var(--primary) 12%, transparent)', outline: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)', outlineOffset: '-1px', transition: 'background 1s, outline 1s' } : undefined}>
                                    <td className="sm-catalogue-name">{v.name}</td>
                                    <td className="sm-catalogue-muted">{v.comment || '—'}</td>
                                    {extraFields.map(ef => (
                                        <td key={ef.key} className="sm-catalogue-muted">
                                            {v.extra?.[ef.key] ?? '—'}
                                        </td>
                                    ))}
                                    <td className="sm-catalogue-actions">
                                        <button className="sm-action-btn" onClick={() => setEditVendor(v)} title="Edit">✎</button>
                                        <button className="sm-action-btn sm-action-danger" onClick={() => handleDelete(v)} title="Delete">✕</button>
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {showAdd && (
                <AddVendorDialog
                    onClose={() => setShowAdd(false)}
                    onCreated={() => { setShowAdd(false); load(); }}
                />
            )}
            {editVendor && (
                <AddVendorDialog
                    vendor={editVendor}
                    onClose={() => setEditVendor(null)}
                    onCreated={() => { setEditVendor(null); load(); }}
                />
            )}
        </div>
    );
}
