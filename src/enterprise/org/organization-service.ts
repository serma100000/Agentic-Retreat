/**
 * Organization management -- CRUD, member invitations, role updates,
 * and plan-based limits.
 */

import { randomBytes } from 'node:crypto';
import type {
  MemberRole,
  OrgPlan,
  Organization,
  TeamMember,
} from '../types.js';

// ── Plan limits ─────────────────────────────────────────────────

interface PlanLimits {
  maxMembers: number;
  maxMonitors: number;
}

const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: { maxMembers: 1, maxMonitors: 5 },
  team: { maxMembers: 10, maxMonitors: 50 },
  enterprise: { maxMembers: Infinity, maxMonitors: Infinity },
};

// ── Helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return randomBytes(12).toString('hex');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── OrganizationService ─────────────────────────────────────────

export class OrganizationService {
  private orgs = new Map<string, Organization>();
  private members = new Map<string, TeamMember[]>(); // orgId -> members

  // ── Organization CRUD ───────────────────────────────────────

  createOrg(
    name: string,
    ownerId: string,
    plan: OrgPlan = 'free',
  ): Organization {
    if (!name.trim()) {
      throw new Error('Organization name is required');
    }

    const limits = PLAN_LIMITS[plan];
    const org: Organization = {
      id: generateId(),
      name: name.trim(),
      slug: slugify(name),
      plan,
      maxMembers: limits.maxMembers,
      maxMonitors: limits.maxMonitors,
      createdAt: new Date(),
    };

    this.orgs.set(org.id, org);

    // Owner is the first member
    const ownerMember: TeamMember = {
      userId: ownerId,
      orgId: org.id,
      role: 'owner',
      invitedBy: ownerId,
      joinedAt: new Date(),
    };
    this.members.set(org.id, [ownerMember]);

    return org;
  }

  getOrg(orgId: string): Organization | null {
    return this.orgs.get(orgId) ?? null;
  }

  updateOrg(orgId: string, updates: Partial<Organization>): Organization {
    const org = this.orgs.get(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    if (updates.name !== undefined) {
      org.name = updates.name.trim();
      org.slug = slugify(org.name);
    }
    if (updates.plan !== undefined) {
      const limits = PLAN_LIMITS[updates.plan];
      org.plan = updates.plan;
      org.maxMembers = limits.maxMembers;
      org.maxMonitors = limits.maxMonitors;
    }

    return org;
  }

  // ── Member management ───────────────────────────────────────

  inviteMember(
    orgId: string,
    email: string,
    role: MemberRole,
    invitedBy: string,
  ): TeamMember {
    const org = this.orgs.get(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const memberList = this.members.get(orgId) ?? [];

    // Check plan limit
    if (memberList.length >= org.maxMembers) {
      throw new Error(
        `Member limit reached for ${org.plan} plan (max ${org.maxMembers})`,
      );
    }

    // Prevent duplicate
    const existing = memberList.find((m) => m.userId === email);
    if (existing) {
      throw new Error(`User ${email} is already a member of this organization`);
    }

    // Cannot invite another owner
    if (role === 'owner') {
      throw new Error('Cannot invite as owner. Transfer ownership instead.');
    }

    const member: TeamMember = {
      userId: email,
      orgId,
      role,
      invitedBy,
      joinedAt: new Date(),
    };

    memberList.push(member);
    this.members.set(orgId, memberList);

    return member;
  }

  removeMember(orgId: string, userId: string): boolean {
    const memberList = this.members.get(orgId);
    if (!memberList) return false;

    const idx = memberList.findIndex((m) => m.userId === userId);
    if (idx === -1) return false;

    const member = memberList[idx]!;
    if (member.role === 'owner') {
      throw new Error('Cannot remove the organization owner');
    }

    memberList.splice(idx, 1);
    return true;
  }

  updateMemberRole(
    orgId: string,
    userId: string,
    newRole: MemberRole,
  ): boolean {
    const memberList = this.members.get(orgId);
    if (!memberList) return false;

    const member = memberList.find((m) => m.userId === userId);
    if (!member) return false;

    if (member.role === 'owner' && newRole !== 'owner') {
      throw new Error('Cannot demote the owner. Transfer ownership first.');
    }
    if (newRole === 'owner') {
      throw new Error('Cannot promote to owner. Transfer ownership instead.');
    }

    member.role = newRole;
    return true;
  }

  listMembers(orgId: string): TeamMember[] {
    return this.members.get(orgId) ?? [];
  }

  // ── Queries ─────────────────────────────────────────────────

  getMemberCount(orgId: string): number {
    return (this.members.get(orgId) ?? []).length;
  }

  getPlanLimits(plan: OrgPlan): PlanLimits {
    return PLAN_LIMITS[plan];
  }
}
