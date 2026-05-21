const { gql } = require('graphql-tag');

const typeDefs = gql`
  type Bearing {
    id: ID!
    name: String!
    model: String!
    price: Float!
    image: String
    category: String!
    specs: BearingSpecs!
    stock: Int!
    description: String
  }

  type BearingSpecs {
    innerDiameter: Float
    outerDiameter: Float
    width: Float
  }

  type Order {
    id: ID!
    customerName: String!
    customerPhone: String!
    customerAddress: String
    totalPrice: Float!
    status: String!
    trackingNumber: String
    createdAt: String
    items: [OrderItem!]
  }

  type OrderItem {
    id: ID!
    bearingId: Int!
    quantity: Int!
    price: Float!
    bearing: Bearing
  }

  type Customer {
    id: ID!
    name: String!
    phone: String!
    email: String
    company: String
    address: String
    level: String!
    points: Int!
    totalSpent: Float!
    totalOrders: Int!
    tags: [String!]
    status: String!
  }

  type Coupon {
    id: ID!
    code: String!
    name: String!
    type: String!
    discountValue: Float
    minOrderAmount: Float
    totalQuantity: Int
    usedQuantity: Int
    validFrom: String
    validUntil: String
    status: String!
  }

  type PaymentOrder {
    id: ID!
    orderId: Int!
    paymentMethod: String!
    amount: Float!
    status: String!
    transactionId: String
    tradeNo: String
    createdAt: String
    paidAt: String
  }

  type AnalyticsDashboard {
    totalProducts: Int!
    totalOrders: Int!
    totalRevenue: Float!
    lowStockProducts: Int!
    outOfStockProducts: Int!
    todayOrders: Int!
    todayRevenue: Float!
  }

  type DemandPrediction {
    productId: ID!
    productName: String!
    model: String!
    currentStock: Int!
    avgDailySales: Float!
    predictedDemand: Int!
    trend: String!
    daysUntilEmpty: Int!
    needsRestock: Boolean!
    recommendedRestock: Int!
  }

  type SalesForecast {
    date: String!
    predictedRevenue: Float!
    predictedOrders: Int!
    dayOfWeek: Int!
  }

  type ChatResponse {
    message: String!
    suggestions: [String!]
    intent: String!
    timestamp: String!
  }

  type Query {
    # Products
    bearings(category: String, search: String, limit: Int, offset: Int): [Bearing!]!
    bearing(id: ID!): Bearing
    categories: [String!]!

    # Orders
    orders(status: String, limit: Int, offset: Int): [Order!]!
    order(id: ID!): Order

    # CRM
    customers(level: String, status: String, search: String, limit: Int, offset: Int): [Customer!]!
    customer(id: ID!): Customer
    coupons(status: String): [Coupon!]!

    # Payment
    payments(status: String, paymentMethod: String): [PaymentOrder!]!
    payment(id: ID!): PaymentOrder

    # Analytics
    dashboard: AnalyticsDashboard!
    demandPredictions: [DemandPrediction!]!
    demandPrediction(productId: ID!, days: Int): DemandPrediction!
    salesForecast(days: Int): [SalesForecast!]!

    # AI
    chat(message: String!): ChatResponse!
    smartRecommendations(customerPhone: String, limit: Int): [Bearing!]!

    # Recommendations
    hotProducts(limit: Int): [Bearing!]!
    newProducts(limit: Int): [Bearing!]!
    similarProducts(productId: ID!, limit: Int): [Bearing!]!
  }

  type Mutation {
    # Orders
    createOrder(
      customerName: String!
      customerPhone: String!
      customerAddress: String!
      items: [OrderItemInput!]!
      totalPrice: Float!
    ): CreateOrderResult!

    updateOrderStatus(orderId: ID!, status: String!, trackingNumber: String, note: String): UpdateResult!

    # Products
    addBearing(
      name: String!
      model: String!
      price: Float!
      category: String!
      stock: Int!
      innerDiameter: Float
      outerDiameter: Float
      width: Float
      image: String
      description: String
    ): CreateResult!

    deleteBearing(id: ID!): UpdateResult!
    updateStock(id: ID!, stock: Int!): UpdateResult!

    # Payment
    createPayment(orderId: ID!, amount: Float!, paymentMethod: String!, subject: String): PaymentCreateResult!
    simulatePayment(paymentOrderId: ID!): UpdateResult!
    createRefund(paymentOrderId: ID!, amount: Float!, reason: String): RefundResult!

    # CRM
    createCustomer(name: String!, phone: String!, email: String, company: String, address: String): CreateResult!
    updateCustomer(id: ID!, tags: [String!], notes: String, status: String): UpdateResult!
    addPoints(customerId: ID!, points: Int!, type: String!, reason: String): UpdateResult!
    createCoupon(
      code: String!
      name: String!
      type: String!
      discountValue: Float
      minOrderAmount: Float
      totalQuantity: Int
      validFrom: String
      validUntil: String
    ): CreateResult!
    issueCoupon(couponId: ID!, customerIds: [ID!]!): UpdateResult!
    useCoupon(code: String!, customerId: ID!, orderId: ID!): CouponUseResult!
  }

  input OrderItemInput {
    id: Int!
    quantity: Int!
    price: Float!
  }

  type CreateOrderResult {
    orderId: ID!
    message: String!
  }

  type CreateResult {
    id: ID!
    message: String!
  }

  type UpdateResult {
    message: String!
  }

  type PaymentCreateResult {
    orderNo: String!
    paymentOrderId: ID!
    qrCode: String
    qrUrl: String
    message: String
  }

  type RefundResult {
    refundId: ID!
    refundNo: String!
    amount: Float!
    status: String!
    message: String!
  }

  type CouponUseResult {
    message: String!
    discountAmount: Float!
  }
`;

module.exports = typeDefs;
