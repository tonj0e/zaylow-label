export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      inventory_batches: {
        Row: {
          id: string
          arrival_date: string
          supplier_name: string | null
          supplier_phone: string | null
          supplier_gst: string | null
          supplier_address: string | null
          invoice_no: string | null
          po_no: string | null
          product_name: string
          sku: string | null
          total_cartons: number
          pieces_per_carton: number
          total_pieces: number
          total_order_value: number | null
          freight_cost: number | null
          other_charges: number | null
          total_landed_cost: number | null
          price_per_piece: number | null
          landed_cost_per_piece: number | null
          remarks: string | null
          status: string
          created_at: string | null
        }
        Insert: {
          id: string
          arrival_date: string
          supplier_name?: string | null
          supplier_phone?: string | null
          supplier_gst?: string | null
          supplier_address?: string | null
          invoice_no?: string | null
          po_no?: string | null
          product_name: string
          sku?: string | null
          total_cartons?: number
          pieces_per_carton?: number
          total_pieces?: number
          total_order_value?: number | null
          freight_cost?: number | null
          other_charges?: number | null
          total_landed_cost?: number | null
          price_per_piece?: number | null
          landed_cost_per_piece?: number | null
          remarks?: string | null
          status?: string
          created_at?: string | null
        }
        Update: {
          id?: string
          arrival_date?: string
          supplier_name?: string | null
          supplier_phone?: string | null
          supplier_gst?: string | null
          supplier_address?: string | null
          invoice_no?: string | null
          po_no?: string | null
          product_name?: string
          sku?: string | null
          total_cartons?: number
          pieces_per_carton?: number
          total_pieces?: number
          total_order_value?: number | null
          freight_cost?: number | null
          other_charges?: number | null
          total_landed_cost?: number | null
          price_per_piece?: number | null
          landed_cost_per_piece?: number | null
          remarks?: string | null
          status?: string
          created_at?: string | null
        }
      }
      cartons: {
        Row: {
          id: string
          created_at: string | null
          updated_at: string | null
          location: string | null
        }
        Insert: {
          id: string
          created_at?: string | null
          updated_at?: string | null
          location?: string | null
        }
        Update: {
          id?: string
          created_at?: string | null
          updated_at?: string | null
          location?: string | null
        }
      }
      inventory_items: {
        Row: {
          id: string
          batch_id: string
          carton_id: string
          sku: string
          qr_code: string | null
          barcode: string | null
          status:
            | 'In Stock'
            | 'Reserved'
            | 'Packed'
            | 'Shipped'
            | 'Delivered'
            | 'Returned'
            | 'Warranty'
            | 'Damaged'
            | 'Lost'
          order_id: string | null
          customer_name: string | null
          mobile: string | null
          created_at: string | null
          updated_at: string | null
          reserved_at: string | null
        }
        Insert: {
          id: string
          batch_id: string
          carton_id: string
          sku: string
          qr_code?: string | null
          barcode?: string | null
          status?:
            | 'In Stock'
            | 'Reserved'
            | 'Packed'
            | 'Shipped'
            | 'Delivered'
            | 'Returned'
            | 'Warranty'
            | 'Damaged'
            | 'Lost'
          order_id?: string | null
          customer_name?: string | null
          mobile?: string | null
          created_at?: string | null
          updated_at?: string | null
          reserved_at?: string | null
        }
        Update: {
          id?: string
          batch_id?: string
          carton_id?: string
          sku?: string
          qr_code?: string | null
          barcode?: string | null
          status?:
            | 'In Stock'
            | 'Reserved'
            | 'Packed'
            | 'Shipped'
            | 'Delivered'
            | 'Returned'
            | 'Warranty'
            | 'Damaged'
            | 'Lost'
          order_id?: string | null
          customer_name?: string | null
          mobile?: string | null
          created_at?: string | null
          updated_at?: string | null
          reserved_at?: string | null
        }
      }
      orders: {
        Row: {
          id: string
          date: string
          customer_name: string
          house_name: string | null
          area: string | null
          city: string | null
          state: string | null
          pincode: string | null
          mobile: string | null
          payment_type: string
          cod_amount: number | null
          courier: string | null
          product_name: string | null
          product_id: string | null
          inventory_id: string | null
          carton_id: string | null
          status: string
          tracking_id: string | null
          shipping_label_url: string | null
          delivered_date: string | null
          warranty_start: string | null
          warranty_end: string | null
          return_reason: string | null
          remarks: string | null
          claim_date: string | null
          claim_reason: string | null
          claim_status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          date: string
          customer_name: string
          house_name?: string | null
          area?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
          mobile?: string | null
          payment_type?: string
          cod_amount?: number | null
          courier?: string | null
          product_name?: string | null
          product_id?: string | null
          inventory_id?: string | null
          carton_id?: string | null
          status?: string
          tracking_id?: string | null
          shipping_label_url?: string | null
          delivered_date?: string | null
          warranty_start?: string | null
          warranty_end?: string | null
          return_reason?: string | null
          remarks?: string | null
          claim_date?: string | null
          claim_reason?: string | null
          claim_status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          date?: string
          customer_name?: string
          house_name?: string | null
          area?: string | null
          city?: string | null
          state?: string | null
          pincode?: string | null
          mobile?: string | null
          payment_type?: string
          cod_amount?: number | null
          courier?: string | null
          product_name?: string | null
          product_id?: string | null
          inventory_id?: string | null
          carton_id?: string | null
          status?: string
          tracking_id?: string | null
          shipping_label_url?: string | null
          delivered_date?: string | null
          warranty_start?: string | null
          warranty_end?: string | null
          return_reason?: string | null
          remarks?: string | null
          claim_date?: string | null
          claim_reason?: string | null
          claim_status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
      }
      returns: {
        Row: {
          id: number
          week_label: string
          date_received: string
          order_id: string | null
          customer: string | null
          mobile: string | null
          product: string | null
          product_id: string | null
          return_reason: string | null
          courier: string | null
          tracking_id: string | null
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          week_label: string
          date_received: string
          order_id?: string | null
          customer?: string | null
          mobile?: string | null
          product?: string | null
          product_id?: string | null
          return_reason?: string | null
          courier?: string | null
          tracking_id?: string | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          week_label?: string
          date_received?: string
          order_id?: string | null
          customer?: string | null
          mobile?: string | null
          product?: string | null
          product_id?: string | null
          return_reason?: string | null
          courier?: string | null
          tracking_id?: string | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
      }
      stock_summary: {
        Row: {
          id: number
          product_name: string
          sku: string | null
          total_in: number
          sold: number
          returned: number
          available: number
          last_updated: string | null
          updated_at: string | null
        }
        Insert: {
          id?: number
          product_name: string
          sku?: string | null
          total_in?: number
          sold?: number
          returned?: number
          available?: number
          last_updated?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: number
          product_name?: string
          sku?: string | null
          total_in?: number
          sold?: number
          returned?: number
          available?: number
          last_updated?: string | null
          updated_at?: string | null
        }
      }
      inventory_out: {
        Row: {
          id: number
          week_label: string
          date: string
          order_id: string | null
          product_id: string | null
          carton_id: string | null
          customer: string | null
          mobile: string | null
          courier: string | null
          tracking_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          week_label: string
          date: string
          order_id?: string | null
          product_id?: string | null
          carton_id?: string | null
          customer?: string | null
          mobile?: string | null
          courier?: string | null
          tracking_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          week_label?: string
          date?: string
          order_id?: string | null
          product_id?: string | null
          carton_id?: string | null
          customer?: string | null
          mobile?: string | null
          courier?: string | null
          tracking_id?: string | null
          created_at?: string | null
        }
      }
      inventory_movement: {
        Row: {
          id: number
          week_label: string
          date: string
          batch_or_product_id: string | null
          order_id: string | null
          movement: string | null
          qty: string | null
          remarks: string | null
          created_at: string | null
        }
        Insert: {
          id?: number
          week_label: string
          date: string
          batch_or_product_id?: string | null
          order_id?: string | null
          movement?: string | null
          qty?: string | null
          remarks?: string | null
          created_at?: string | null
        }
        Update: {
          id?: number
          week_label?: string
          date?: string
          batch_or_product_id?: string | null
          order_id?: string | null
          movement?: string | null
          qty?: string | null
          remarks?: string | null
          created_at?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
