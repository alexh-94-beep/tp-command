export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      apartment_channel_links: {
        Row: {
          apartment_id: string
          channel_id: string
          created_at: string
          external_id: string | null
          ical_pull_url: string | null
          ical_push_url: string | null
          updated_at: string
        }
        Insert: {
          apartment_id: string
          channel_id: string
          created_at?: string
          external_id?: string | null
          ical_pull_url?: string | null
          ical_push_url?: string | null
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          channel_id?: string
          created_at?: string
          external_id?: string | null
          ical_pull_url?: string | null
          ical_push_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apartment_channel_links_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartment_channel_links_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartment_channel_links_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      apartments: {
        Row: {
          allowed_rental_types: Database["public"]["Enums"]["rental_type"][]
          booking_priority: number
          building: string
          cleaning_buffer_hours: number
          created_at: string
          current_move_in: string | null
          current_move_out: string | null
          current_tenant_label: string | null
          external_link_3d: string | null
          floor: number | null
          furnishing_completion: number
          has_parking: boolean
          id: string
          keybox_default_code: string | null
          keybox_default_location: string | null
          name_tag_status: Database["public"]["Enums"]["name_tag_status"]
          notes: string | null
          number: string
          orientation: string | null
          ownership: Database["public"]["Enums"]["apartment_ownership"]
          parking_fee: number | null
          sale_price: number | null
          short_term_flat_rate: number | null
          size_sqm: number | null
          standard_rent: number
          status: Database["public"]["Enums"]["apartment_status"]
          type: Database["public"]["Enums"]["apartment_type"]
          updated_at: string
        }
        Insert: {
          allowed_rental_types?: Database["public"]["Enums"]["rental_type"][]
          booking_priority?: number
          building: string
          cleaning_buffer_hours?: number
          created_at?: string
          current_move_in?: string | null
          current_move_out?: string | null
          current_tenant_label?: string | null
          external_link_3d?: string | null
          floor?: number | null
          furnishing_completion?: number
          has_parking?: boolean
          id?: string
          keybox_default_code?: string | null
          keybox_default_location?: string | null
          name_tag_status?: Database["public"]["Enums"]["name_tag_status"]
          notes?: string | null
          number: string
          orientation?: string | null
          ownership?: Database["public"]["Enums"]["apartment_ownership"]
          parking_fee?: number | null
          sale_price?: number | null
          short_term_flat_rate?: number | null
          size_sqm?: number | null
          standard_rent?: number
          status?: Database["public"]["Enums"]["apartment_status"]
          type: Database["public"]["Enums"]["apartment_type"]
          updated_at?: string
        }
        Update: {
          allowed_rental_types?: Database["public"]["Enums"]["rental_type"][]
          booking_priority?: number
          building?: string
          cleaning_buffer_hours?: number
          created_at?: string
          current_move_in?: string | null
          current_move_out?: string | null
          current_tenant_label?: string | null
          external_link_3d?: string | null
          floor?: number | null
          furnishing_completion?: number
          has_parking?: boolean
          id?: string
          keybox_default_code?: string | null
          keybox_default_location?: string | null
          name_tag_status?: Database["public"]["Enums"]["name_tag_status"]
          notes?: string | null
          number?: string
          orientation?: string | null
          ownership?: Database["public"]["Enums"]["apartment_ownership"]
          parking_fee?: number | null
          sale_price?: number | null
          short_term_flat_rate?: number | null
          size_sqm?: number | null
          standard_rent?: number
          status?: Database["public"]["Enums"]["apartment_status"]
          type?: Database["public"]["Enums"]["apartment_type"]
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          apartment_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          reason: string
          start_date: string
          updated_at: string
        }
        Insert: {
          apartment_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          reason: string
          start_date: string
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          reason?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_occupants: {
        Row: {
          booking_id: string
          created_at: string
          is_main_tenant: boolean
          notes: string | null
          role: Database["public"]["Enums"]["occupant_role"]
          tenant_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          is_main_tenant?: boolean
          notes?: string | null
          role?: Database["public"]["Enums"]["occupant_role"]
          tenant_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          is_main_tenant?: boolean
          notes?: string | null
          role?: Database["public"]["Enums"]["occupant_role"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_occupants_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_occupants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_tasks: {
        Row: {
          assigned_to: string | null
          booking_id: string
          category: string | null
          code: string | null
          completed_at: string | null
          completed_by: string | null
          condition_key: string | null
          created_at: string
          description: string | null
          due_anchor: Database["public"]["Enums"]["task_due_anchor"] | null
          due_date: string | null
          id: string
          is_conditional: boolean
          is_optional: boolean
          kind: Database["public"]["Enums"]["workflow_kind"]
          notes: string | null
          position: number
          status: Database["public"]["Enums"]["booking_task_status"]
          template_id: string | null
          template_task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          booking_id: string
          category?: string | null
          code?: string | null
          completed_at?: string | null
          completed_by?: string | null
          condition_key?: string | null
          created_at?: string
          description?: string | null
          due_anchor?: Database["public"]["Enums"]["task_due_anchor"] | null
          due_date?: string | null
          id?: string
          is_conditional?: boolean
          is_optional?: boolean
          kind: Database["public"]["Enums"]["workflow_kind"]
          notes?: string | null
          position: number
          status?: Database["public"]["Enums"]["booking_task_status"]
          template_id?: string | null
          template_task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          booking_id?: string
          category?: string | null
          code?: string | null
          completed_at?: string | null
          completed_by?: string | null
          condition_key?: string | null
          created_at?: string
          description?: string | null
          due_anchor?: Database["public"]["Enums"]["task_due_anchor"] | null
          due_date?: string | null
          id?: string
          is_conditional?: boolean
          is_optional?: boolean
          kind?: Database["public"]["Enums"]["workflow_kind"]
          notes?: string | null
          position?: number
          status?: Database["public"]["Enums"]["booking_task_status"]
          template_id?: string | null
          template_task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_tasks_template_task_id_fkey"
            columns: ["template_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_template_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          apartment_id: string
          channel_id: string | null
          check_in_status: Database["public"]["Enums"]["checkinout_status"]
          check_in_time: string | null
          check_out_status: Database["public"]["Enums"]["checkinout_status"]
          check_out_time: string | null
          contract_status: Database["public"]["Enums"]["contract_status"]
          created_at: string
          deposit_amount: number
          end_date: string
          external_reference: string | null
          handover_by: string | null
          handover_completed_at: string | null
          handover_planned_at: string | null
          id: string
          move_in_by: string | null
          move_in_completed_at: string | null
          move_in_planned_at: string | null
          notes: string | null
          parking_fee: number | null
          parking_included: boolean
          payment_status: Database["public"]["Enums"]["booking_payment_status"]
          rent_amount: number
          rental_type: Database["public"]["Enums"]["rental_type"]
          short_term_flat_rate: number | null
          start_date: string
          status: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          apartment_id: string
          channel_id?: string | null
          check_in_status?: Database["public"]["Enums"]["checkinout_status"]
          check_in_time?: string | null
          check_out_status?: Database["public"]["Enums"]["checkinout_status"]
          check_out_time?: string | null
          contract_status?: Database["public"]["Enums"]["contract_status"]
          created_at?: string
          deposit_amount?: number
          end_date: string
          external_reference?: string | null
          handover_by?: string | null
          handover_completed_at?: string | null
          handover_planned_at?: string | null
          id?: string
          move_in_by?: string | null
          move_in_completed_at?: string | null
          move_in_planned_at?: string | null
          notes?: string | null
          parking_fee?: number | null
          parking_included?: boolean
          payment_status?: Database["public"]["Enums"]["booking_payment_status"]
          rent_amount?: number
          rental_type: Database["public"]["Enums"]["rental_type"]
          short_term_flat_rate?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          channel_id?: string | null
          check_in_status?: Database["public"]["Enums"]["checkinout_status"]
          check_in_time?: string | null
          check_out_status?: Database["public"]["Enums"]["checkinout_status"]
          check_out_time?: string | null
          contract_status?: Database["public"]["Enums"]["contract_status"]
          created_at?: string
          deposit_amount?: number
          end_date?: string
          external_reference?: string | null
          handover_by?: string | null
          handover_completed_at?: string | null
          handover_planned_at?: string | null
          id?: string
          move_in_by?: string | null
          move_in_completed_at?: string | null
          move_in_planned_at?: string | null
          notes?: string | null
          parking_fee?: number | null
          parking_included?: boolean
          payment_status?: Database["public"]["Enums"]["booking_payment_status"]
          rent_amount?: number
          rental_type?: Database["public"]["Enums"]["rental_type"]
          short_term_flat_rate?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["booking_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_handover_by_fkey"
            columns: ["handover_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_move_in_by_fkey"
            columns: ["move_in_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          code: string
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          code: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          code?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      cleaning_photos: {
        Row: {
          cleaning_task_id: string
          created_at: string
          id: string
          storage_path: string
          taken_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          cleaning_task_id: string
          created_at?: string
          id?: string
          storage_path: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          cleaning_task_id?: string
          created_at?: string
          id?: string
          storage_path?: string
          taken_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_photos_cleaning_task_id_fkey"
            columns: ["cleaning_task_id"]
            isOneToOne: false
            referencedRelation: "cleaning_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_photos_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_schedules: {
        Row: {
          apartment_id: string | null
          created_at: string
          default_assignee: string | null
          end_date: string | null
          external_apartment_id: string | null
          frequency: Database["public"]["Enums"]["cleaning_frequency"]
          id: string
          is_active: boolean
          notes: string | null
          start_date: string
          updated_at: string
          weekday: number
        }
        Insert: {
          apartment_id?: string | null
          created_at?: string
          default_assignee?: string | null
          end_date?: string | null
          external_apartment_id?: string | null
          frequency: Database["public"]["Enums"]["cleaning_frequency"]
          id?: string
          is_active?: boolean
          notes?: string | null
          start_date?: string
          updated_at?: string
          weekday: number
        }
        Update: {
          apartment_id?: string | null
          created_at?: string
          default_assignee?: string | null
          end_date?: string | null
          external_apartment_id?: string | null
          frequency?: Database["public"]["Enums"]["cleaning_frequency"]
          id?: string
          is_active?: boolean
          notes?: string | null
          start_date?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_schedules_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_schedules_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_schedules_default_assignee_fkey"
            columns: ["default_assignee"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_schedules_external_apartment_id_fkey"
            columns: ["external_apartment_id"]
            isOneToOne: false
            referencedRelation: "external_apartments"
            referencedColumns: ["id"]
          },
        ]
      }
      cleaning_staff: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          is_hourly: boolean
          is_lead: boolean
          notes: string | null
          pensum_percent: number
          phone: string | null
          speed_factor: number
          team_name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          is_hourly?: boolean
          is_lead?: boolean
          notes?: string | null
          pensum_percent?: number
          phone?: string | null
          speed_factor?: number
          team_name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_hourly?: boolean
          is_lead?: boolean
          notes?: string | null
          pensum_percent?: number
          phone?: string | null
          speed_factor?: number
          team_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cleaning_tasks: {
        Row: {
          access_method: Database["public"]["Enums"]["access_method"] | null
          access_notes: string | null
          actual_duration_minutes: number | null
          apartment_id: string | null
          assigned_to: string | null
          booking_id: string | null
          completed_at: string | null
          created_at: string
          damage_description: string | null
          damage_found: boolean | null
          estimated_duration_minutes: number | null
          external_apartment_id: string | null
          id: string
          inspection_summary: string | null
          linen_change: boolean
          notes: string | null
          priority: Database["public"]["Enums"]["cleaning_priority"]
          quality_checked_at: string | null
          quality_checked_by: string | null
          schedule_id: string | null
          scheduled_date: string
          scheduled_time: string | null
          scheduled_window: unknown
          source: string
          staff_id: string | null
          status: Database["public"]["Enums"]["cleaning_status"]
          subleasing_stay_id: string | null
          time_constraint_note: string | null
          time_flexible: boolean
          type: Database["public"]["Enums"]["cleaning_type"]
          updated_at: string
        }
        Insert: {
          access_method?: Database["public"]["Enums"]["access_method"] | null
          access_notes?: string | null
          actual_duration_minutes?: number | null
          apartment_id?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          damage_description?: string | null
          damage_found?: boolean | null
          estimated_duration_minutes?: number | null
          external_apartment_id?: string | null
          id?: string
          inspection_summary?: string | null
          linen_change?: boolean
          notes?: string | null
          priority?: Database["public"]["Enums"]["cleaning_priority"]
          quality_checked_at?: string | null
          quality_checked_by?: string | null
          schedule_id?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          scheduled_window?: unknown
          source?: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"]
          subleasing_stay_id?: string | null
          time_constraint_note?: string | null
          time_flexible?: boolean
          type: Database["public"]["Enums"]["cleaning_type"]
          updated_at?: string
        }
        Update: {
          access_method?: Database["public"]["Enums"]["access_method"] | null
          access_notes?: string | null
          actual_duration_minutes?: number | null
          apartment_id?: string | null
          assigned_to?: string | null
          booking_id?: string | null
          completed_at?: string | null
          created_at?: string
          damage_description?: string | null
          damage_found?: boolean | null
          estimated_duration_minutes?: number | null
          external_apartment_id?: string | null
          id?: string
          inspection_summary?: string | null
          linen_change?: boolean
          notes?: string | null
          priority?: Database["public"]["Enums"]["cleaning_priority"]
          quality_checked_at?: string | null
          quality_checked_by?: string | null
          schedule_id?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          scheduled_window?: unknown
          source?: string
          staff_id?: string | null
          status?: Database["public"]["Enums"]["cleaning_status"]
          subleasing_stay_id?: string | null
          time_constraint_note?: string | null
          time_flexible?: boolean
          type?: Database["public"]["Enums"]["cleaning_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_tasks_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_external_apartment_id_fkey"
            columns: ["external_apartment_id"]
            isOneToOne: false
            referencedRelation: "external_apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_quality_checked_by_fkey"
            columns: ["quality_checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "cleaning_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "cleaning_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_tasks_subleasing_stay_id_fkey"
            columns: ["subleasing_stay_id"]
            isOneToOne: false
            referencedRelation: "subleasing_stays"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          apartment_id: string | null
          body: string | null
          booking_id: string | null
          channel: Database["public"]["Enums"]["communication_channel"]
          created_at: string
          id: string
          recipient: string
          scheduled_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["communication_status"]
          subject: string | null
          template_key: string | null
          type: Database["public"]["Enums"]["communication_type"]
          updated_at: string
        }
        Insert: {
          apartment_id?: string | null
          body?: string | null
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          id?: string
          recipient: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string | null
          template_key?: string | null
          type: Database["public"]["Enums"]["communication_type"]
          updated_at?: string
        }
        Update: {
          apartment_id?: string | null
          body?: string | null
          booking_id?: string | null
          channel?: Database["public"]["Enums"]["communication_channel"]
          created_at?: string
          id?: string
          recipient?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["communication_status"]
          subject?: string | null
          template_key?: string | null
          type?: Database["public"]["Enums"]["communication_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      defects: {
        Row: {
          apartment_id: string
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          notes: string | null
          reported_at: string
          reported_by: string | null
          resolved_at: string | null
          severity: Database["public"]["Enums"]["defect_severity"]
          status: Database["public"]["Enums"]["defect_status"]
          title: string
          updated_at: string
        }
        Insert: {
          apartment_id: string
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          reported_at?: string
          reported_by?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["defect_severity"]
          status?: Database["public"]["Enums"]["defect_status"]
          title: string
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          notes?: string | null
          reported_at?: string
          reported_by?: string | null
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["defect_severity"]
          status?: Database["public"]["Enums"]["defect_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "defects_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "defects_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      external_apartments: {
        Row: {
          address: string | null
          contact: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          contact?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          contact?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      maintenance_visits: {
        Row: {
          apartment_id: string
          contact_method: Database["public"]["Enums"]["maintenance_contact_method"]
          created_at: string
          id: string
          notes: string | null
          responsible: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: Database["public"]["Enums"]["maintenance_visit_status"]
          topic: string | null
          updated_at: string
        }
        Insert: {
          apartment_id: string
          contact_method?: Database["public"]["Enums"]["maintenance_contact_method"]
          created_at?: string
          id?: string
          notes?: string | null
          responsible?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["maintenance_visit_status"]
          topic?: string | null
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          contact_method?: Database["public"]["Enums"]["maintenance_contact_method"]
          created_at?: string
          id?: string
          notes?: string | null
          responsible?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: Database["public"]["Enums"]["maintenance_visit_status"]
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_visits_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_visits_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          due_date: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_date: string | null
          reference: string | null
          status: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          due_date: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_date?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          due_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_date?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          type?: Database["public"]["Enums"]["payment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_reservations: {
        Row: {
          assigned_at: string | null
          assigned_booking_id: string | null
          assigned_by: string | null
          channel_id: string
          created_at: string
          description: string | null
          end_date: string
          external_uid: string
          guest_count: number | null
          id: string
          raw_payload: Json | null
          start_date: string
          status: Database["public"]["Enums"]["pending_reservation_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_booking_id?: string | null
          assigned_by?: string | null
          channel_id: string
          created_at?: string
          description?: string | null
          end_date: string
          external_uid: string
          guest_count?: number | null
          id?: string
          raw_payload?: Json | null
          start_date: string
          status?: Database["public"]["Enums"]["pending_reservation_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_booking_id?: string | null
          assigned_by?: string | null
          channel_id?: string
          created_at?: string
          description?: string | null
          end_date?: string
          external_uid?: string
          guest_count?: number | null
          id?: string
          raw_payload?: Json | null
          start_date?: string
          status?: Database["public"]["Enums"]["pending_reservation_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_reservations_assigned_booking_id_fkey"
            columns: ["assigned_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_reservations_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_reservations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      standalone_tasks: {
        Row: {
          apartment_id: string | null
          assignee_id: string | null
          category: Database["public"]["Enums"]["standalone_task_category"]
          created_at: string
          created_by: string | null
          description: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          notes: string | null
          priority: Database["public"]["Enums"]["standalone_task_priority"]
          status: Database["public"]["Enums"]["standalone_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          apartment_id?: string | null
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["standalone_task_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["standalone_task_priority"]
          status?: Database["public"]["Enums"]["standalone_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          apartment_id?: string | null
          assignee_id?: string | null
          category?: Database["public"]["Enums"]["standalone_task_category"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["standalone_task_priority"]
          status?: Database["public"]["Enums"]["standalone_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standalone_tasks_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_tasks_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_tasks_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subleasing_stays: {
        Row: {
          apartment_id: string
          check_in_date: string
          check_in_time: string | null
          check_out_date: string
          check_out_time: string | null
          created_at: string
          external_reference: string | null
          guest_count: number | null
          guest_name: string
          id: string
          keybox_code: string | null
          notes: string | null
          parent_booking_id: string | null
          source: Database["public"]["Enums"]["sub_source"]
          status: Database["public"]["Enums"]["sub_status"]
          updated_at: string
        }
        Insert: {
          apartment_id: string
          check_in_date: string
          check_in_time?: string | null
          check_out_date: string
          check_out_time?: string | null
          created_at?: string
          external_reference?: string | null
          guest_count?: number | null
          guest_name: string
          id?: string
          keybox_code?: string | null
          notes?: string | null
          parent_booking_id?: string | null
          source?: Database["public"]["Enums"]["sub_source"]
          status?: Database["public"]["Enums"]["sub_status"]
          updated_at?: string
        }
        Update: {
          apartment_id?: string
          check_in_date?: string
          check_in_time?: string | null
          check_out_date?: string
          check_out_time?: string | null
          created_at?: string
          external_reference?: string | null
          guest_count?: number | null
          guest_name?: string
          id?: string
          keybox_code?: string | null
          notes?: string | null
          parent_booking_id?: string | null
          source?: Database["public"]["Enums"]["sub_source"]
          status?: Database["public"]["Enums"]["sub_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subleasing_stays_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subleasing_stays_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subleasing_stays_parent_booking_id_fkey"
            columns: ["parent_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_documents: {
        Row: {
          booking_id: string | null
          filename: string
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          tenant_id: string | null
          type: Database["public"]["Enums"]["tenant_document_type"]
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          booking_id?: string | null
          filename: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["tenant_document_type"]
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          booking_id?: string | null
          filename?: string
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          tenant_id?: string | null
          type?: Database["public"]["Enums"]["tenant_document_type"]
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          address: string | null
          annual_income: number | null
          civil_status: Database["public"]["Enums"]["civil_status"] | null
          company_name: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          employer: string | null
          employment_status:
            | Database["public"]["Enums"]["employment_status"]
            | null
          first_name: string | null
          flatfox_raw: Json | null
          gender: Database["public"]["Enums"]["gender"] | null
          has_debt_collection: boolean | null
          heimatort: string | null
          id: string
          id_document_number: string | null
          id_document_type: Database["public"]["Enums"]["id_doc_type"] | null
          last_name: string | null
          nationality: string | null
          notes: string | null
          phone: string | null
          previous_landlord: string | null
          previous_landlord_email: string | null
          previous_landlord_phone: string | null
          profession: string | null
          residence_permit:
            | Database["public"]["Enums"]["residence_permit"]
            | null
          source: Database["public"]["Enums"]["tenant_source"]
          tenant_kind: Database["public"]["Enums"]["tenant_kind"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          annual_income?: number | null
          civil_status?: Database["public"]["Enums"]["civil_status"] | null
          company_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employer?: string | null
          employment_status?:
            | Database["public"]["Enums"]["employment_status"]
            | null
          first_name?: string | null
          flatfox_raw?: Json | null
          gender?: Database["public"]["Enums"]["gender"] | null
          has_debt_collection?: boolean | null
          heimatort?: string | null
          id?: string
          id_document_number?: string | null
          id_document_type?: Database["public"]["Enums"]["id_doc_type"] | null
          last_name?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          previous_landlord?: string | null
          previous_landlord_email?: string | null
          previous_landlord_phone?: string | null
          profession?: string | null
          residence_permit?:
            | Database["public"]["Enums"]["residence_permit"]
            | null
          source?: Database["public"]["Enums"]["tenant_source"]
          tenant_kind: Database["public"]["Enums"]["tenant_kind"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          annual_income?: number | null
          civil_status?: Database["public"]["Enums"]["civil_status"] | null
          company_name?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          employer?: string | null
          employment_status?:
            | Database["public"]["Enums"]["employment_status"]
            | null
          first_name?: string | null
          flatfox_raw?: Json | null
          gender?: Database["public"]["Enums"]["gender"] | null
          has_debt_collection?: boolean | null
          heimatort?: string | null
          id?: string
          id_document_number?: string | null
          id_document_type?: Database["public"]["Enums"]["id_doc_type"] | null
          last_name?: string | null
          nationality?: string | null
          notes?: string | null
          phone?: string | null
          previous_landlord?: string | null
          previous_landlord_email?: string | null
          previous_landlord_phone?: string | null
          profession?: string | null
          residence_permit?:
            | Database["public"]["Enums"]["residence_permit"]
            | null
          source?: Database["public"]["Enums"]["tenant_source"]
          tenant_kind?: Database["public"]["Enums"]["tenant_kind"]
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          assigned_apartment: string | null
          budget_max: number | null
          created_at: string
          desired_move_in: string | null
          desired_type: Database["public"]["Enums"]["apartment_type"] | null
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
          updated_at: string
        }
        Insert: {
          assigned_apartment?: string | null
          budget_max?: number | null
          created_at?: string
          desired_move_in?: string | null
          desired_type?: Database["public"]["Enums"]["apartment_type"] | null
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
        }
        Update: {
          assigned_apartment?: string | null
          budget_max?: number | null
          created_at?: string
          desired_move_in?: string | null
          desired_type?: Database["public"]["Enums"]["apartment_type"] | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_assigned_apartment_fkey"
            columns: ["assigned_apartment"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_assigned_apartment_fkey"
            columns: ["assigned_apartment"]
            isOneToOne: false
            referencedRelation: "view_apartment_status_today"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_template_tasks: {
        Row: {
          assignee_role: Database["public"]["Enums"]["task_assignee_role"]
          category: string | null
          code: string
          condition_key: string | null
          created_at: string
          description: string | null
          due_anchor: Database["public"]["Enums"]["task_due_anchor"]
          due_offset_days: number
          id: string
          is_conditional: boolean
          is_optional: boolean
          position: number
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_role?: Database["public"]["Enums"]["task_assignee_role"]
          category?: string | null
          code: string
          condition_key?: string | null
          created_at?: string
          description?: string | null
          due_anchor?: Database["public"]["Enums"]["task_due_anchor"]
          due_offset_days?: number
          id?: string
          is_conditional?: boolean
          is_optional?: boolean
          position: number
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_role?: Database["public"]["Enums"]["task_assignee_role"]
          category?: string | null
          code?: string
          condition_key?: string | null
          created_at?: string
          description?: string | null
          due_anchor?: Database["public"]["Enums"]["task_due_anchor"]
          due_offset_days?: number
          id?: string
          is_conditional?: boolean
          is_optional?: boolean
          position?: number
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["workflow_kind"]
          name: string
          scope: Database["public"]["Enums"]["workflow_scope"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["workflow_kind"]
          name: string
          scope: Database["public"]["Enums"]["workflow_scope"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["workflow_kind"]
          name?: string
          scope?: Database["public"]["Enums"]["workflow_scope"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      view_apartment_status_today: {
        Row: {
          building: string | null
          effective_status:
            | Database["public"]["Enums"]["apartment_status"]
            | null
          id: string | null
          number: string | null
          ownership: Database["public"]["Enums"]["apartment_ownership"] | null
          type: Database["public"]["Enums"]["apartment_type"] | null
        }
        Relationships: []
      }
      view_dashboard_kpis: {
        Row: {
          free_apartments: number | null
          needs_attention: number | null
          occupied_apartments: number | null
          open_cleanings: number | null
          open_payments: number | null
          total_apartments: number | null
          upcoming_checkins: number | null
          upcoming_checkouts: number | null
        }
        Relationships: []
      }
      view_occupancy_calendar: {
        Row: {
          apartment_id: string | null
          apartment_number: string | null
          end_date: string | null
          event_id: string | null
          event_kind: string | null
          label: string | null
          start_date: string | null
          status: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      can_write: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_cleaning: { Args: never; Returns: boolean }
      mark_overdue_payments: { Args: never; Returns: number }
      recompute_booking_payment_status: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
    }
    Enums: {
      access_method:
        | "key_available"
        | "customer_at_home"
        | "key_at_reception"
        | "key_box"
        | "other"
      apartment_ownership: "own" | "sold_managed" | "sold_external"
      apartment_status:
        | "available"
        | "occupied"
        | "terminated"
        | "contract_pending"
        | "booking_active"
        | "maintenance"
        | "blocked"
      apartment_type: "junior" | "senior" | "suite" | "studio"
      booking_payment_status: "pending" | "partial" | "paid" | "overdue"
      booking_status: "planned" | "active" | "completed" | "cancelled"
      booking_task_status: "open" | "in_progress" | "done" | "skipped" | "na"
      checkinout_status: "pending" | "completed"
      civil_status:
        | "single"
        | "married"
        | "divorced"
        | "widowed"
        | "partnership"
        | "separated"
        | "unknown"
      cleaning_frequency: "weekly" | "biweekly"
      cleaning_priority: "low" | "normal" | "high" | "urgent"
      cleaning_status: "open" | "in_progress" | "done" | "quality_checked"
      cleaning_type:
        | "checkout"
        | "pre_checkin"
        | "intermediate"
        | "special"
        | "deep_clean"
        | "inspection"
        | "weekly_clean"
        | "weekly_clean_linen"
      communication_channel: "email" | "sms" | "internal"
      communication_status:
        | "draft"
        | "scheduled"
        | "sent"
        | "failed"
        | "cancelled"
      communication_type:
        | "welcome"
        | "payment_info"
        | "checkin_info"
        | "wifi_info"
        | "payment_reminder"
        | "checkout_info"
        | "internal_cleaning_notification"
      contract_status: "draft" | "sent" | "signed" | "cancelled"
      defect_severity: "low" | "normal" | "high" | "urgent"
      defect_status: "open" | "in_progress" | "resolved" | "wont_fix"
      employment_status:
        | "employed"
        | "self_employed"
        | "retired"
        | "student"
        | "unemployed"
        | "other"
        | "unknown"
      gender: "male" | "female" | "other" | "unknown"
      id_doc_type: "passport" | "id_card" | "driver_license"
      maintenance_contact_method: "email" | "whatsapp" | "phone" | "none"
      maintenance_visit_status: "planned" | "confirmed" | "done" | "cancelled"
      name_tag_status: "pending" | "ordered" | "installed"
      occupant_role:
        | "main_tenant"
        | "co_tenant"
        | "partner"
        | "child"
        | "roommate"
        | "other"
      payment_method:
        | "bank_transfer"
        | "manual_slip"
        | "booking_payout"
        | "flatfox"
        | "card"
        | "other"
      payment_status: "pending" | "paid" | "overdue" | "cancelled"
      payment_type:
        | "rent"
        | "deposit"
        | "first_rent"
        | "booking_payout"
        | "short_term_flat"
        | "parking"
        | "other"
      pending_reservation_status: "pending" | "assigned" | "cancelled"
      rental_type: "long_term" | "short_term" | "booking"
      residence_permit:
        | "C"
        | "B"
        | "L"
        | "F"
        | "G"
        | "N"
        | "S"
        | "CH"
        | "EU"
        | "other"
        | "none"
      standalone_task_category: "repair" | "office" | "inspection" | "other"
      standalone_task_priority: "low" | "normal" | "high" | "urgent"
      standalone_task_status: "open" | "in_progress" | "done" | "cancelled"
      sub_source: "cityus" | "other"
      sub_status: "planned" | "in_stay" | "completed" | "cancelled"
      task_assignee_role: "office" | "admin" | "cleaning" | "any"
      task_due_anchor: "created" | "check_in" | "check_out"
      tenant_document_type:
        | "passport"
        | "id_card"
        | "residence_permit"
        | "salary_slip"
        | "tax_certificate"
        | "debt_collection_certificate"
        | "flatfox_application"
        | "contract"
        | "other"
      tenant_kind: "tenant" | "guest" | "company"
      tenant_source:
        | "direct"
        | "flatfox"
        | "booking_com"
        | "airbnb"
        | "expedia"
        | "website"
      user_role: "admin" | "office" | "cleaning" | "management"
      waitlist_status: "open" | "contacted" | "placed" | "dropped"
      workflow_kind: "move_in" | "move_out"
      workflow_scope: "long_term" | "short_term" | "booking" | "all"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_method: [
        "key_available",
        "customer_at_home",
        "key_at_reception",
        "key_box",
        "other",
      ],
      apartment_ownership: ["own", "sold_managed", "sold_external"],
      apartment_status: [
        "available",
        "occupied",
        "terminated",
        "contract_pending",
        "booking_active",
        "maintenance",
        "blocked",
      ],
      apartment_type: ["junior", "senior", "suite", "studio"],
      booking_payment_status: ["pending", "partial", "paid", "overdue"],
      booking_status: ["planned", "active", "completed", "cancelled"],
      booking_task_status: ["open", "in_progress", "done", "skipped", "na"],
      checkinout_status: ["pending", "completed"],
      civil_status: [
        "single",
        "married",
        "divorced",
        "widowed",
        "partnership",
        "separated",
        "unknown",
      ],
      cleaning_frequency: ["weekly", "biweekly"],
      cleaning_priority: ["low", "normal", "high", "urgent"],
      cleaning_status: ["open", "in_progress", "done", "quality_checked"],
      cleaning_type: [
        "checkout",
        "pre_checkin",
        "intermediate",
        "special",
        "deep_clean",
        "inspection",
        "weekly_clean",
        "weekly_clean_linen",
      ],
      communication_channel: ["email", "sms", "internal"],
      communication_status: [
        "draft",
        "scheduled",
        "sent",
        "failed",
        "cancelled",
      ],
      communication_type: [
        "welcome",
        "payment_info",
        "checkin_info",
        "wifi_info",
        "payment_reminder",
        "checkout_info",
        "internal_cleaning_notification",
      ],
      contract_status: ["draft", "sent", "signed", "cancelled"],
      defect_severity: ["low", "normal", "high", "urgent"],
      defect_status: ["open", "in_progress", "resolved", "wont_fix"],
      employment_status: [
        "employed",
        "self_employed",
        "retired",
        "student",
        "unemployed",
        "other",
        "unknown",
      ],
      gender: ["male", "female", "other", "unknown"],
      id_doc_type: ["passport", "id_card", "driver_license"],
      maintenance_contact_method: ["email", "whatsapp", "phone", "none"],
      maintenance_visit_status: ["planned", "confirmed", "done", "cancelled"],
      name_tag_status: ["pending", "ordered", "installed"],
      occupant_role: [
        "main_tenant",
        "co_tenant",
        "partner",
        "child",
        "roommate",
        "other",
      ],
      payment_method: [
        "bank_transfer",
        "manual_slip",
        "booking_payout",
        "flatfox",
        "card",
        "other",
      ],
      payment_status: ["pending", "paid", "overdue", "cancelled"],
      payment_type: [
        "rent",
        "deposit",
        "first_rent",
        "booking_payout",
        "short_term_flat",
        "parking",
        "other",
      ],
      pending_reservation_status: ["pending", "assigned", "cancelled"],
      rental_type: ["long_term", "short_term", "booking"],
      residence_permit: [
        "C",
        "B",
        "L",
        "F",
        "G",
        "N",
        "S",
        "CH",
        "EU",
        "other",
        "none",
      ],
      standalone_task_category: ["repair", "office", "inspection", "other"],
      standalone_task_priority: ["low", "normal", "high", "urgent"],
      standalone_task_status: ["open", "in_progress", "done", "cancelled"],
      sub_source: ["cityus", "other"],
      sub_status: ["planned", "in_stay", "completed", "cancelled"],
      task_assignee_role: ["office", "admin", "cleaning", "any"],
      task_due_anchor: ["created", "check_in", "check_out"],
      tenant_document_type: [
        "passport",
        "id_card",
        "residence_permit",
        "salary_slip",
        "tax_certificate",
        "debt_collection_certificate",
        "flatfox_application",
        "contract",
        "other",
      ],
      tenant_kind: ["tenant", "guest", "company"],
      tenant_source: [
        "direct",
        "flatfox",
        "booking_com",
        "airbnb",
        "expedia",
        "website",
      ],
      user_role: ["admin", "office", "cleaning", "management"],
      waitlist_status: ["open", "contacted", "placed", "dropped"],
      workflow_kind: ["move_in", "move_out"],
      workflow_scope: ["long_term", "short_term", "booking", "all"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
