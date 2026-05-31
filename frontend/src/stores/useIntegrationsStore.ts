import { create } from 'zustand';
import { api } from '@/lib/api';
import type {
    GradePassback,
    LtiContextLink,
    LtiPlatform,
    LtiPlatformCreate,
    LtiResourceLink,
} from '@/lib/integrations.types';

interface IntegrationsState {
    platforms: LtiPlatform[];
    contexts: LtiContextLink[];
    resourceLinks: LtiResourceLink[];
    passbacks: GradePassback[];
    loading: boolean;

    loadPlatforms: () => Promise<void>;
    createPlatform: (payload: LtiPlatformCreate) => Promise<void>;
    loadContexts: (unmappedOnly?: boolean) => Promise<void>;
    mapContext: (id: string, courseId: string) => Promise<void>;
    loadResourceLinks: (unmappedOnly?: boolean) => Promise<void>;
    mapResourceLink: (
        id: string,
        body: { scheduled_session_id?: string; test_definition_id?: string }
    ) => Promise<void>;
    loadPassbacks: () => Promise<void>;
    retryPassback: (id: string) => Promise<void>;
}

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
    platforms: [],
    contexts: [],
    resourceLinks: [],
    passbacks: [],
    loading: false,

    loadPlatforms: async () => {
        set({ loading: true });
        try {
            const { data } = await api.get('lti/platforms');
            set({ platforms: data.items ?? [] });
        } finally {
            set({ loading: false });
        }
    },

    createPlatform: async (payload) => {
        await api.post('lti/platforms', payload);
        await get().loadPlatforms();
    },

    loadContexts: async (unmappedOnly = false) => {
        const { data } = await api.get('lti/contexts', { params: { unmapped_only: unmappedOnly } });
        set({ contexts: data.items ?? [] });
    },

    mapContext: async (id, courseId) => {
        await api.patch(`lti/contexts/${id}`, { course_id: courseId });
        await get().loadContexts();
    },

    loadResourceLinks: async (unmappedOnly = false) => {
        const { data } = await api.get('lti/resource-links', {
            params: { unmapped_only: unmappedOnly },
        });
        set({ resourceLinks: data.items ?? [] });
    },

    mapResourceLink: async (id, body) => {
        await api.patch(`lti/resource-links/${id}`, body);
        await get().loadResourceLinks();
    },

    loadPassbacks: async () => {
        const { data } = await api.get('lti/grade-passbacks');
        set({ passbacks: data.items ?? [] });
    },

    retryPassback: async (id) => {
        await api.post(`lti/grade-passbacks/${id}/retry`);
        await get().loadPassbacks();
    },
}));
